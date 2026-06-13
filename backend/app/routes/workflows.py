"""Workflow endpoints (SPEC §6.2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db, scheduler, storage
from ..models import Stage, Trigger, new_id

router = APIRouter(prefix="/workflows", tags=["workflows"])


class TaskRefIn(BaseModel):
    task_id: str
    task_version: int | None = None  # None = always latest (resolved at run time)
    enabled: bool = True
    continue_on_failure: bool = False
    params: dict[str, Any] = Field(default_factory=dict)


class StageIn(BaseModel):
    tasks: list[TaskRefIn] = Field(default_factory=list)


class TriggerIn(BaseModel):
    # id is optional: omitted (or a client-temp "t_*") means a brand-new trigger,
    # which gets a server id minted. Existing ids are preserved across the version.
    id: str | None = None
    type: str
    cron: str | None = None
    enabled: bool = True


class SaveVersion(BaseModel):
    name: str
    description: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    stages: list[StageIn] = Field(default_factory=list)
    # Triggers are part of the versioned definition (SPEC §4.1). Including them
    # here lets one save write stages + params + triggers as a SINGLE version,
    # instead of minting an extra version per trigger via the /triggers routes.
    # Omit the field entirely to carry the prior version's triggers forward.
    triggers: list[TriggerIn] | None = None


class CreateWorkflow(BaseModel):
    name: str
    description: str | None = None
    # Optional initial definition: seeding these makes the new workflow's first
    # saved definition version 1 (instead of an empty v1 shell + a v2 with content).
    params: dict[str, Any] = Field(default_factory=dict)
    stages: list[StageIn] = Field(default_factory=list)
    triggers: list[TriggerIn] = Field(default_factory=list)


def _stages_in(stages: list[StageIn]) -> list[Stage]:
    return [Stage(tasks=[t.model_dump() for t in s.tasks]) for s in stages]


def _triggers_in(triggers: list[TriggerIn]) -> list[Trigger]:
    # New / client-temp "t_*" ids get a real server id; existing ids are preserved.
    return [
        Trigger(
            id=(t.id if (t.id and not t.id.startswith("t_")) else new_id()),
            type=t.type,
            enabled=t.enabled,
            cron=t.cron if t.type == "cron" else None,
        )
        for t in triggers
    ]


def _last_execution(wf_id: str) -> dict[str, Any] | None:
    rows = db.query(
        "SELECT status, degraded, started_at FROM executions "
        "WHERE workflow_id=? ORDER BY started_at DESC LIMIT 1",
        (wf_id,),
    )
    if not rows:
        return None
    r = rows[0]
    return {
        "status": r["status"],
        "degraded": bool(r["degraded"]),
        "started_at": r["started_at"],
    }


def _trigger_dicts(ver: Any) -> list[dict[str, Any]]:
    """A version's triggers with a live-computed next_at (SPEC §4.1)."""
    if ver is None:
        return []
    return [scheduler.trigger_payload(t) for t in ver.triggers]


def _schedule_summary(triggers: list[dict[str, Any]]) -> dict[str, Any]:
    # Triggers live in the workflow's versioned definition (SPEC §4.1), not the
    # index; next_at is computed live, not stored.
    crons = [t for t in triggers if t["type"] == "cron"]
    enabled_crons = [t for t in crons if t["enabled"]]
    if not crons:
        return {"scheduled": False, "type": "manual", "crons": [], "next_at": None}
    next_ats = sorted([t["next_at"] for t in enabled_crons if t["next_at"]])
    return {
        "scheduled": bool(enabled_crons),
        "type": "cron",
        "crons": [t["cron"] for t in crons],
        "next_at": next_ats[0] if next_ats else None,
    }


def _counts(ver: Any) -> tuple[int, int]:
    if ver is None:
        return 0, 0
    stage_count = len(ver.stages)
    task_count = sum(len(s.tasks) for s in ver.stages)
    return stage_count, task_count


@router.get("")
def list_workflows(search: str | None = None, filter: str = "All") -> list[dict[str, Any]]:
    # Index rows are id-only (SPEC §5); fields come from each workflow's YAML meta.
    out: list[dict[str, Any]] = []
    for meta in storage.list_workflow_metas():
        wf_id = meta.id
        # One read of the latest version serves both counts and triggers.
        ver = storage.read_workflow_version(wf_id, meta.latest_version)
        sched = _schedule_summary(_trigger_dicts(ver))
        if filter == "Scheduled" and not sched["scheduled"]:
            continue
        if search and search.lower() not in meta.name.lower() and (
            not meta.description or search.lower() not in meta.description.lower()
        ):
            continue
        stage_count, task_count = _counts(ver)
        out.append({
            "id": wf_id,
            "name": meta.name,
            "description": meta.description,
            "latest_version": meta.latest_version,
            "created_at": meta.created_at,
            "updated_at": meta.updated_at,
            "stage_count": stage_count,
            "task_count": task_count,
            "schedule": sched,
            "last_execution": _last_execution(wf_id),
        })
    return out


@router.post("", status_code=201)
def create_workflow(body: CreateWorkflow) -> dict[str, Any]:
    # Name uniqueness is enforced at the app level (no DB UNIQUE constraint, SPEC §5).
    if any(m.name == body.name for m in storage.list_workflow_metas()):
        raise HTTPException(409, f"Workflow name already exists: {body.name}")
    try:
        meta = storage.create_workflow(
            body.name, body.description,
            params=body.params,
            stages=_stages_in(body.stages),
            triggers=_triggers_in(body.triggers),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    # Pick up any new cron triggers now, not on the next ~20s tick (SPEC §7).
    scheduler.refresh()
    return meta.model_dump()


@router.get("/{wf_id}")
def get_workflow(wf_id: str) -> dict[str, Any]:
    meta = storage.read_workflow_meta(wf_id)
    if meta is None:
        raise HTTPException(404, "Workflow not found")
    ver = storage.read_workflow_version(wf_id, meta.latest_version)
    # Triggers come from the latest version (SPEC §4.1), with a live next_at.
    return {
        **meta.model_dump(),
        "versions": storage.workflow_version_numbers(wf_id),
        "triggers": _trigger_dicts(ver),
    }


@router.get("/{wf_id}/versions/{n}")
def get_workflow_version(wf_id: str, n: int) -> dict[str, Any]:
    ver = storage.read_workflow_version(wf_id, n)
    if ver is None:
        raise HTTPException(404, "Workflow version not found")
    return {**ver.model_dump(), "triggers": _trigger_dicts(ver)}


@router.post("/{wf_id}/versions", status_code=201)
def save_workflow_version(wf_id: str, body: SaveVersion) -> dict[str, Any]:
    if storage.read_workflow_meta(wf_id) is None:
        raise HTTPException(404, "Workflow not found")
    stages = _stages_in(body.stages)
    # None → carry the prior version's triggers forward; a list → replace them
    # wholesale in this one version (new/"t_*" ids are minted server-side).
    triggers = None if body.triggers is None else _triggers_in(body.triggers)
    try:
        ver = storage.save_workflow_version(
            wf_id, name=body.name, description=body.description,
            params=body.params, stages=stages, triggers=triggers,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    # A saved version can add/enable/retime triggers — refresh so they go live now.
    scheduler.refresh()
    return ver.model_dump()


@router.delete("/{wf_id}", status_code=204)
def delete_workflow(wf_id: str) -> None:
    if not storage.delete_workflow(wf_id):
        raise HTTPException(404, "Workflow not found")
