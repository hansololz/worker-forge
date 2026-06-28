"""Execution endpoints (SPEC §6.5)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, paths, runner, storage

router = APIRouter(prefix="/executions", tags=["executions"])

PAGE_SIZE = 50


class LaunchExecution(BaseModel):
    workflow_id: str
    workflow_version: int | None = None
    # Flat global run params (applied to every task).
    params: dict[str, Any] = Field(default_factory=dict)
    # Per-slot run params keyed by the task's flattened index over the run's
    # enabled tasks; overrides the global ``params`` so two refs of the same task
    # keep distinct values. May include ad-hoc keys the task doesn't declare.
    task_params: dict[str, dict[str, Any]] = Field(default_factory=dict)


@router.get("")
def list_executions(
    status: str = "all",
    workflow_id: str | None = None,
    page: int = 1,
) -> dict[str, Any]:
    where: list[str] = []
    args: list[Any] = []
    if status == "succeeded":
        where.append("status='succeeded'")
    elif status == "failed":
        where.append("status='failed'")
    if workflow_id:
        where.append("workflow_id=?")
        args.append(workflow_id)
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = db.query(f"SELECT COUNT(*) AS c FROM executions{clause}", tuple(args))[0]["c"]
    page = max(1, page)
    offset = (page - 1) * PAGE_SIZE
    rows = db.query(
        "SELECT id,workflow_id,workflow_name,workflow_version,status,degraded,"
        "trigger,actor,started_at,finished_at,duration_sec "
        f"FROM executions{clause} ORDER BY started_at DESC LIMIT ? OFFSET ?",
        tuple(args) + (PAGE_SIZE, offset),
    )
    items = [
        {
            "id": r["id"], "workflow_id": r["workflow_id"],
            "workflow_name": r["workflow_name"],
            "workflow_version": r["workflow_version"],
            "status": r["status"], "degraded": bool(r["degraded"]),
            "trigger": r["trigger"], "actor": r["actor"],
            "duration_sec": r["duration_sec"], "started_at": r["started_at"],
            "finished_at": r["finished_at"],
        }
        for r in rows
    ]
    return {
        "items": items,
        "page": page,
        "page_size": PAGE_SIZE,
        "total": total,
        "pages": max(1, (total + PAGE_SIZE - 1) // PAGE_SIZE),
    }


def _validate_required(
    wf_version: Any,
    run_params: dict[str, Any],
    task_params: dict[str, dict[str, Any]],
) -> None:
    """Ensure required task env keys are satisfied by run/ref/wf/default."""
    missing: list[str] = []
    # ``slot`` mirrors the runner's flattened index over enabled tasks, so run
    # params (keyed by slot) line up with the right task ref.
    slot = -1
    for stage in wf_version.stages:
        for ref in stage.tasks:
            if not ref.enabled:
                continue
            slot += 1
            version = storage.resolve_task_version(ref.task_id, ref.task_version)
            task_def = storage.read_task_version(ref.task_id, version)
            if task_def is None:
                continue
            per_task = task_params.get(str(slot), {})
            for e in task_def.env:
                if not e.required:
                    continue
                # Same precedence as runner._resolve_params (last source wins);
                # check key presence rather than truthiness so a provided "0"/""
                # counts. Only a None/empty resolved value is "missing".
                val: Any = e.default
                for src in (wf_version.params, ref.params, run_params, per_task):
                    if e.key in src:
                        val = src[e.key]
                if val is None or str(val) == "":
                    missing.append(e.key)
    if missing:
        raise HTTPException(
            400, f"Missing required params: {', '.join(sorted(set(missing)))}"
        )


@router.post("", status_code=201)
def launch_execution(body: LaunchExecution) -> dict[str, Any]:
    meta = storage.read_workflow_meta(body.workflow_id)
    if meta is None:
        raise HTTPException(404, "Workflow not found")
    version = body.workflow_version or meta.latest_version
    wf_version = storage.read_workflow_version(body.workflow_id, version)
    if wf_version is None:
        raise HTTPException(404, "Workflow version not found")
    _validate_required(wf_version, body.params, body.task_params)
    ex = runner.launch(
        body.workflow_id, wf_version, meta.name, body.params,
        trigger="manual", actor="user", task_params=body.task_params,
    )
    return ex.model_dump()


@router.get("/{exec_id}")
def get_execution(exec_id: str) -> dict[str, Any]:
    ex = storage.read_execution(exec_id)
    if ex is None:
        raise HTTPException(404, "Execution not found")
    data = ex.model_dump()
    # Absolute $WORKSPACE path for the run, so the UI's "Workspace" button can
    # reveal it in the OS file manager (the renderer doesn't know the root).
    data["workspace_dir"] = str(paths.execution_workspace(ex.workspace_id))
    return data


@router.get("/{exec_id}/logs/{log_id}")
def get_log(exec_id: str, log_id: str) -> dict[str, Any]:
    lines = storage.read_log_lines(exec_id, log_id)
    if lines is None:
        raise HTTPException(404, "Log not found")
    return {"lines": [ln.model_dump() for ln in lines]}


@router.post("/{exec_id}/cancel")
def cancel_execution(exec_id: str) -> dict[str, Any]:
    if storage.read_execution(exec_id) is None:
        raise HTTPException(404, "Execution not found")
    ok = runner.cancel(exec_id)
    if not ok:
        raise HTTPException(409, "Execution is not cancellable")
    return {"status": "cancelling"}


@router.post("/{exec_id}/rerun", status_code=201)
def rerun_execution(exec_id: str) -> dict[str, Any]:
    ex = runner.rerun(exec_id)
    if ex is None:
        raise HTTPException(404, "Execution or workflow version not found")
    return ex.model_dump()


@router.post("/{exec_id}/retry-from-failure")
def retry_from_failure(exec_id: str) -> dict[str, Any]:
    ex = runner.retry_from_failure(exec_id)
    if ex is None:
        raise HTTPException(409, "Execution is not in a retriable failed state")
    return ex.model_dump()


@router.post("/{exec_id}/skip-failed")
def skip_failed(exec_id: str) -> dict[str, Any]:
    ex = runner.skip_failed(exec_id)
    if ex is None:
        raise HTTPException(409, "Execution has no failed tasks to skip")
    return ex.model_dump()


# --- Task-scoped controls (single task within a run) -----------------------
@router.post("/{exec_id}/tasks/{stage_index}/{task_index}/cancel")
def cancel_task(exec_id: str, stage_index: int, task_index: int) -> dict[str, Any]:
    if storage.read_execution(exec_id) is None:
        raise HTTPException(404, "Execution not found")
    ok = runner.cancel_task(exec_id, stage_index, task_index)
    if not ok:
        raise HTTPException(409, "Task is not cancellable")
    return {"status": "cancelling"}


@router.post("/{exec_id}/tasks/{stage_index}/{task_index}/skip")
def skip_task(exec_id: str, stage_index: int, task_index: int) -> dict[str, Any]:
    ex = runner.skip_task(exec_id, stage_index, task_index)
    if ex is None:
        raise HTTPException(409, "Task is not in a skippable state")
    return ex.model_dump()


@router.post("/{exec_id}/tasks/{stage_index}/{task_index}/retry")
def retry_task(exec_id: str, stage_index: int, task_index: int) -> dict[str, Any]:
    ex = runner.retry_task(exec_id, stage_index, task_index)
    if ex is None:
        raise HTTPException(409, "Task is not in a retriable state")
    return ex.model_dump()
