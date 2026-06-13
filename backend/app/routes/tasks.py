"""Task endpoints (SPEC §6.4)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import storage
from ..models import (
    EnvParam,
    Step,
    TaskVersion,
    new_id,
    now_iso,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


class EnvIn(BaseModel):
    key: str
    default: str = ""
    required: bool = False


class StepIn(BaseModel):
    name: str
    description: str | None = None
    lang: str = "bash"
    code: str = ""


class TaskBody(BaseModel):
    name: str
    description: str | None = None
    icon: str = "box"
    category: str = "ops"
    interpreter: str = "bash"
    retries: int = 0
    timeout_sec: int | None = None
    env: list[EnvIn] = Field(default_factory=list)
    steps: list[StepIn] = Field(default_factory=list)


def _build_version(task_id: str, body: TaskBody, version: int) -> TaskVersion:
    # Env-key validation is enforced once, in storage.create_task / save_task_version.
    return TaskVersion(
        id=task_id, version=version, name=body.name, description=body.description,
        icon=body.icon, category=body.category, interpreter=body.interpreter,
        retries=body.retries, timeout_sec=body.timeout_sec,
        env=[EnvParam(key=e.key, default=e.default, required=e.required) for e in body.env],
        steps=[Step(name=s.name, description=s.description, lang=s.lang, code=s.code)
               for s in body.steps],
        created_at=now_iso(),
    )


def _used_by_count(task_id: str) -> int:
    return len(storage.task_referenced_by(task_id))


@router.get("")
def list_tasks() -> list[dict[str, Any]]:
    # Index rows are id-only (SPEC §5); fields come from each task's YAML meta.
    return [
        {
            "id": m.id, "name": m.name, "description": m.description,
            "icon": m.icon, "category": m.category,
            "latest_version": m.latest_version,
            "created_at": m.created_at, "updated_at": m.updated_at,
            "used_by": _used_by_count(m.id),
        }
        for m in storage.list_task_metas()
    ]


@router.post("", status_code=201)
def create_task(body: TaskBody) -> dict[str, Any]:
    try:
        version = _build_version(new_id(), body, 1)
        meta = storage.create_task(version)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return meta.model_dump()


@router.get("/{task_id}")
def get_task(task_id: str) -> dict[str, Any]:
    meta = storage.read_task_meta(task_id)
    if meta is None:
        raise HTTPException(404, "Task not found")
    return {
        **meta.model_dump(),
        "versions": storage.task_version_numbers(task_id),
        "used_by": _used_by_count(task_id),
    }


@router.get("/{task_id}/versions/{n}")
def get_task_version(task_id: str, n: int) -> dict[str, Any]:
    ver = storage.read_task_version(task_id, n)
    if ver is None:
        raise HTTPException(404, "Task version not found")
    return ver.model_dump()


@router.post("/{task_id}/versions", status_code=201)
def save_task_version(task_id: str, body: TaskBody) -> dict[str, Any]:
    if storage.read_task_meta(task_id) is None:
        raise HTTPException(404, "Task not found")
    try:
        version = _build_version(task_id, body, 1)  # version set inside save
        ver = storage.save_task_version(task_id, version)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return ver.model_dump()


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: str) -> None:
    if storage.read_task_meta(task_id) is None:
        raise HTTPException(404, "Task not found")
    refs = storage.task_referenced_by(task_id)
    if refs:
        raise HTTPException(
            409, f"Task is referenced by {len(refs)} workflow(s); cannot delete."
        )
    storage.delete_task(task_id)
