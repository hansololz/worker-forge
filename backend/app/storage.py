"""YAML read/write of the data-directory file tree (SPEC §4). Files are the source
of truth. Editing a workflow/task writes a NEW version file and bumps
``latest_version``; prior versions are immutable.

Param-key validation (``^[A-Z_][A-Z0-9_]*$``) is enforced on write.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import yaml

from . import paths
from .models import (
    EnvParam,
    Execution,
    LogDoc,
    LogLine,
    Stage,
    Step,
    TaskMeta,
    TaskRef,
    TaskVersion,
    Trigger,
    WorkflowMeta,
    WorkflowVersion,
    new_id,
    now_iso,
    validate_param_keys,
)

# A coarse lock guarding multi-step write sequences (metadata + version files).
_write_lock = threading.RLock()


# ---------------------------------------------------------------------------
# Low-level YAML helpers
# ---------------------------------------------------------------------------
def _read_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data or {}


def _write_yaml(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, default_flow_style=False, allow_unicode=True)
    tmp.replace(path)


def _model_dump(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="python")


def _db():
    """Lazily import the index module.

    ``db`` imports ``storage`` at module load, so storage imports ``db`` only at
    call time to keep the SQLite index in sync automatically on every write/delete
    (SPEC §5). Index reads never write, so there is no re-entrancy.
    """
    from . import db
    return db


def _version_numbers(versions_dir: Path) -> list[int]:
    """Sorted version numbers from a ``versions/`` dir (stems parsed as ints)."""
    if not versions_dir.exists():
        return []
    out = []
    for p in versions_dir.glob("*.yaml"):
        try:
            out.append(int(p.stem))
        except ValueError:
            continue
    return sorted(out)


# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------
def _wf_dir(wf_id: str) -> Path:
    return paths.workflows_dir() / wf_id


def _wf_meta_path(wf_id: str) -> Path:
    return _wf_dir(wf_id) / "metadata.yaml"


def _wf_version_path(wf_id: str, n: int) -> Path:
    return _wf_dir(wf_id) / "versions" / f"{n}.yaml"


def list_workflow_ids() -> list[str]:
    root = paths.workflows_dir()
    if not root.exists():
        return []
    return [p.name for p in root.iterdir() if (p / "metadata.yaml").exists()]


def read_workflow_meta(wf_id: str) -> WorkflowMeta | None:
    p = _wf_meta_path(wf_id)
    if not p.exists():
        return None
    return WorkflowMeta.model_validate(_read_yaml(p))


def read_workflow_version(wf_id: str, n: int) -> WorkflowVersion | None:
    p = _wf_version_path(wf_id, n)
    if not p.exists():
        return None
    return WorkflowVersion.model_validate(_read_yaml(p))


def workflow_version_numbers(wf_id: str) -> list[int]:
    return _version_numbers(_wf_dir(wf_id) / "versions")


def list_workflow_metas() -> list[WorkflowMeta]:
    """All workflow metas, name-sorted (case-insensitive). Skips unreadable ones."""
    metas = [m for m in (read_workflow_meta(i) for i in list_workflow_ids()) if m is not None]
    metas.sort(key=lambda m: m.name.lower())
    return metas


def write_workflow_meta(meta: WorkflowMeta) -> None:
    _write_yaml(_wf_meta_path(meta.id), _model_dump(meta))


def create_workflow(
    name: str,
    description: str | None = None,
    *,
    params: dict[str, Any] | None = None,
    stages: list[Stage] | None = None,
    triggers: list[Trigger] | None = None,
) -> WorkflowMeta:
    """Create a workflow, seeding **version 1** with the given definition.

    Passing stages/params/triggers here lets a brand-new workflow's first saved
    definition be version 1 (rather than an empty v1 shell + a v2 with content).
    """
    params = params or {}
    stages = stages or []
    triggers = triggers or []
    with _write_lock:
        wf_id = new_id()
        ts = now_iso()
        validate_param_keys(params)
        for st in stages:
            for ref in st.tasks:
                validate_param_keys(ref.params)
        meta = WorkflowMeta(
            id=wf_id, name=name, description=description,
            latest_version=1, created_at=ts, updated_at=ts,
        )
        version = WorkflowVersion(
            id=wf_id, version=1, name=name, description=description,
            params=params, stages=stages, triggers=triggers, created_at=ts,
        )
        write_workflow_meta(meta)
        _write_yaml(_wf_version_path(wf_id, 1), _model_dump(version))
        _db().index_workflow(wf_id)
        return meta


def save_workflow_version(
    wf_id: str,
    *,
    name: str,
    description: str | None,
    params: dict[str, Any],
    stages: list[Stage],
    triggers: list[Trigger] | None = None,
) -> WorkflowVersion:
    """Write a new version (latest_version + 1) and bump the meta.

    ``triggers`` are part of the versioned definition (SPEC §4.1). Pass ``None``
    to carry the current latest version's triggers forward unchanged (so editing
    stages keeps the schedule); pass a list to replace them.
    """
    with _write_lock:
        meta = read_workflow_meta(wf_id)
        if meta is None:
            raise KeyError(wf_id)
        validate_param_keys(params)
        for st in stages:
            for ref in st.tasks:
                validate_param_keys(ref.params)
        if triggers is None:
            cur = read_workflow_version(wf_id, meta.latest_version)
            triggers = list(cur.triggers) if cur else []
        n = meta.latest_version + 1
        ts = now_iso()
        version = WorkflowVersion(
            id=wf_id, version=n, name=name, description=description,
            params=params, stages=stages, triggers=triggers, created_at=ts,
        )
        _write_yaml(_wf_version_path(wf_id, n), _model_dump(version))
        meta.latest_version = n
        meta.name = name
        meta.description = description
        meta.updated_at = ts
        write_workflow_meta(meta)
        _db().index_workflow(wf_id)
        return version


def delete_workflow(wf_id: str) -> bool:
    import shutil

    d = _wf_dir(wf_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    _db().deindex_workflow(wf_id)
    return True


# ---------------------------------------------------------------------------
# Triggers (part of the versioned workflow definition, SPEC §4.1)
#
# A trigger lives in the workflow's latest version file. Every edit mints a NEW
# version (via ``save_workflow_version`` with the modified trigger list), so the
# schedule is pinned, auditable, and rolls back with the rest of the definition.
# ``find_trigger`` therefore searches each workflow's *latest* version.
# ---------------------------------------------------------------------------
def latest_workflow_version(wf_id: str) -> WorkflowVersion | None:
    meta = read_workflow_meta(wf_id)
    if meta is None:
        return None
    return read_workflow_version(wf_id, meta.latest_version)


def _save_triggers(ver: WorkflowVersion, triggers: list[Trigger]) -> WorkflowVersion:
    """Mint a new version of ``ver``'s workflow with the given trigger list."""
    return save_workflow_version(
        ver.id, name=ver.name, description=ver.description,
        params=ver.params, stages=ver.stages, triggers=triggers,
    )


def add_trigger(
    wf_id: str, type_: str, cron: str | None, enabled: bool
) -> Trigger:
    with _write_lock:
        ver = latest_workflow_version(wf_id)
        if ver is None:
            raise KeyError(wf_id)
        trig = Trigger(
            id=new_id(), type=type_, enabled=enabled,
            cron=cron if type_ == "cron" else None,
        )
        _save_triggers(ver, list(ver.triggers) + [trig])
        return trig


def find_trigger(trigger_id: str) -> tuple[WorkflowVersion, Trigger] | None:
    for wf_id in list_workflow_ids():
        ver = latest_workflow_version(wf_id)
        if ver is None:
            continue
        for t in ver.triggers:
            if t.id == trigger_id:
                return ver, t
    return None


def update_trigger(
    trigger_id: str,
    *,
    cron: str | None = None,
    enabled: bool | None = None,
) -> Trigger | None:
    with _write_lock:
        found = find_trigger(trigger_id)
        if found is None:
            return None
        ver, trig = found
        updated = trig.model_copy()
        if cron is not None:
            updated.cron = cron
        if enabled is not None:
            updated.enabled = enabled
        _save_triggers(
            ver, [updated if t.id == trigger_id else t for t in ver.triggers]
        )
        return updated


def delete_trigger(trigger_id: str) -> bool:
    with _write_lock:
        found = find_trigger(trigger_id)
        if found is None:
            return False
        ver, _trig = found
        _save_triggers(ver, [t for t in ver.triggers if t.id != trigger_id])
        return True


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
def _task_dir(task_id: str) -> Path:
    return paths.tasks_dir() / task_id


def _task_meta_path(task_id: str) -> Path:
    return _task_dir(task_id) / "metadata.yaml"


def _task_version_path(task_id: str, n: int) -> Path:
    return _task_dir(task_id) / "versions" / f"{n}.yaml"


def list_task_ids() -> list[str]:
    root = paths.tasks_dir()
    if not root.exists():
        return []
    return [p.name for p in root.iterdir() if (p / "metadata.yaml").exists()]


def read_task_meta(task_id: str) -> TaskMeta | None:
    p = _task_meta_path(task_id)
    if not p.exists():
        return None
    return TaskMeta.model_validate(_read_yaml(p))


def read_task_version(task_id: str, n: int) -> TaskVersion | None:
    p = _task_version_path(task_id, n)
    if not p.exists():
        return None
    return TaskVersion.model_validate(_read_yaml(p))


def task_version_numbers(task_id: str) -> list[int]:
    return _version_numbers(_task_dir(task_id) / "versions")


def resolve_task_version(task_id: str, n: int | None) -> int:
    """Resolve a TaskRef's pinned version. ``None`` means "always latest" —
    resolve it to the task's current ``latest_version`` at call time so each run
    picks up newly-saved versions. A concrete int is returned unchanged."""
    if n is not None:
        return n
    meta = read_task_meta(task_id)
    return meta.latest_version if meta else 1


def list_task_metas() -> list[TaskMeta]:
    """All task metas, name-sorted (case-insensitive). Skips unreadable ones."""
    metas = [m for m in (read_task_meta(i) for i in list_task_ids()) if m is not None]
    metas.sort(key=lambda m: m.name.lower())
    return metas


def write_task_meta(meta: TaskMeta) -> None:
    _write_yaml(_task_meta_path(meta.id), _model_dump(meta))


def _validate_task_env(env: list[EnvParam]) -> None:
    for e in env:
        validate_param_keys({e.key: ""})


def create_task(version: TaskVersion) -> TaskMeta:
    with _write_lock:
        _validate_task_env(version.env)
        ts = now_iso()
        version = version.model_copy(update={"version": 1, "created_at": ts})
        meta = TaskMeta(
            id=version.id, name=version.name, description=version.description,
            icon=version.icon, category=version.category,
            latest_version=1, created_at=ts, updated_at=ts,
        )
        write_task_meta(meta)
        _write_yaml(_task_version_path(version.id, 1), _model_dump(version))
        _db().index_task(version.id)
        return meta


def save_task_version(task_id: str, version: TaskVersion) -> TaskVersion:
    with _write_lock:
        meta = read_task_meta(task_id)
        if meta is None:
            raise KeyError(task_id)
        _validate_task_env(version.env)
        n = meta.latest_version + 1
        ts = now_iso()
        version = version.model_copy(
            update={"id": task_id, "version": n, "created_at": ts}
        )
        _write_yaml(_task_version_path(task_id, n), _model_dump(version))
        meta.latest_version = n
        meta.name = version.name
        meta.description = version.description
        meta.icon = version.icon
        meta.category = version.category
        meta.updated_at = ts
        write_task_meta(meta)
        _db().index_task(task_id)
        return version


def delete_task(task_id: str) -> bool:
    import shutil

    d = _task_dir(task_id)
    if not d.exists():
        return False
    shutil.rmtree(d)
    _db().deindex_task(task_id)
    return True


def task_referenced_by(task_id: str) -> list[str]:
    """Workflow ids whose latest version references this task."""
    out = []
    for wf_id in list_workflow_ids():
        meta = read_workflow_meta(wf_id)
        if meta is None:
            continue
        ver = read_workflow_version(wf_id, meta.latest_version)
        if ver is None:
            continue
        for st in ver.stages:
            if any(ref.task_id == task_id for ref in st.tasks):
                out.append(wf_id)
                break
    return out


# ---------------------------------------------------------------------------
# Executions
# ---------------------------------------------------------------------------
def _exec_dir(exec_id: str) -> Path:
    return paths.executions_dir() / exec_id


def _exec_path(exec_id: str) -> Path:
    return _exec_dir(exec_id) / "execution.yaml"


def _log_path(exec_id: str, log_id: str) -> Path:
    return _exec_dir(exec_id) / "logs" / f"{log_id}.txt"


def list_execution_ids() -> list[str]:
    root = paths.executions_dir()
    if not root.exists():
        return []
    return [p.name for p in root.iterdir() if (p / "execution.yaml").exists()]


def read_execution(exec_id: str) -> Execution | None:
    p = _exec_path(exec_id)
    if not p.exists():
        return None
    return Execution.model_validate(_read_yaml(p))


def write_execution(execution: Execution) -> None:
    _write_yaml(_exec_path(execution.id), _model_dump(execution))
    _db().index_execution(execution.id)


def read_log_lines(exec_id: str, log_id: str) -> list[LogLine] | None:
    """Read a step's log file. Each line is `ts<TAB>stream<TAB>msg`."""
    p = _log_path(exec_id, log_id)
    if not p.exists():
        return None
    out: list[LogLine] = []
    with p.open("r", encoding="utf-8") as f:
        for raw in f:
            raw = raw.rstrip("\n")
            ts, _, rest = raw.partition("\t")
            stream, _, msg = rest.partition("\t")
            out.append(LogLine(ts=ts, stream=stream, msg=msg))
    return out


def write_log(log: LogDoc) -> None:
    """Persist a step's log lines as plain text (one `ts<TAB>stream<TAB>msg` per line).

    Step->log mapping and metadata live in execution.yaml (StepOutcome.log_id), so
    only the line bodies are stored here.
    """
    path = _log_path(log.execution_id, log.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        for ln in log.lines:
            f.write(f"{ln.ts}\t{ln.stream}\t{ln.msg}\n")
    tmp.replace(path)


__all__ = [name for name in dir() if not name.startswith("_")]
