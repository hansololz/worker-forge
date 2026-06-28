"""Trigger endpoints (SPEC §6.3).

Triggers are part of the workflow's versioned definition (they live in the
latest version file, SPEC §4.1) and are also a first-class API resource. Every
create/patch/delete mints a NEW workflow version. ``next_at`` is computed live
for the response (never stored, since version files are immutable).
The workflow-scoped routes are mounted on the workflows path; the standalone
``/triggers`` routes are mounted directly under ``/api``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import scheduler, storage

# Mounted under /workflows for the create/list endpoints.
wf_router = APIRouter(prefix="/workflows", tags=["triggers"])
# Mounted at the api root for PATCH/DELETE/GET-all.
router = APIRouter(tags=["triggers"])


class CreateTrigger(BaseModel):
    type: str
    cron: str | None = None
    enabled: bool = True


class PatchTrigger(BaseModel):
    cron: str | None = None
    enabled: bool | None = None


def _trigger_dict(wf_id: str, wf_name: str, t: Any) -> dict[str, Any]:
    # next_at is computed live (not stored, SPEC §4.1) from the cron expression.
    return scheduler.trigger_payload(t, wf_id=wf_id, wf_name=wf_name)


@wf_router.get("/{wf_id}/triggers")
def list_triggers(wf_id: str) -> list[dict[str, Any]]:
    ver = storage.latest_workflow_version(wf_id)
    if ver is None:
        raise HTTPException(404, "Workflow not found")
    return [_trigger_dict(wf_id, ver.name, t) for t in ver.triggers]


@wf_router.post("/{wf_id}/triggers", status_code=201)
def create_trigger(wf_id: str, body: CreateTrigger) -> dict[str, Any]:
    ver = storage.latest_workflow_version(wf_id)
    if ver is None:
        raise HTTPException(404, "Workflow not found")
    if body.type not in ("cron", "manual"):
        raise HTTPException(400, "type must be cron or manual")
    if body.type == "cron" and not body.cron:
        raise HTTPException(400, "cron expression required for cron triggers")
    trig = storage.add_trigger(wf_id, body.type, body.cron, body.enabled)
    scheduler.refresh()  # New cron trigger live now, not on the next ~20s tick.
    return _trigger_dict(wf_id, ver.name, trig)


@router.patch("/triggers/{trigger_id}")
def patch_trigger(trigger_id: str, body: PatchTrigger) -> dict[str, Any]:
    trig = storage.update_trigger(
        trigger_id, cron=body.cron, enabled=body.enabled
    )
    if trig is None:
        raise HTTPException(404, "Trigger not found")
    scheduler.refresh()  # Retime/enable/disable takes effect now.
    found = storage.find_trigger(trigger_id)
    wf = found[0] if found else None
    return _trigger_dict(wf.id if wf else "", wf.name if wf else "", trig)


@router.delete("/triggers/{trigger_id}", status_code=204)
def delete_trigger(trigger_id: str) -> None:
    if not storage.delete_trigger(trigger_id):
        raise HTTPException(404, "Trigger not found")
    scheduler.refresh()  # Drop the removed trigger from the fire cache now.


@router.get("/triggers")
def list_all_triggers() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for wf_id in storage.list_workflow_ids():
        ver = storage.latest_workflow_version(wf_id)
        if ver is None:
            continue
        for t in ver.triggers:
            out.append(_trigger_dict(wf_id, ver.name, t))
    return out
