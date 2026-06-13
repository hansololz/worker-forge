"""Settings / data-directory endpoints (SPEC §6.6).

Config is stored separately from the data directory (config.json at a fixed
per-user OS path). The data-directory path is one of the settings.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import db, paths

router = APIRouter(prefix="/settings", tags=["settings"])


class PatchSettings(BaseModel):
    timezone: str | None = None
    launch_on_startup: bool | None = None
    keep_running_in_background: bool | None = None
    executions_separate: bool | None = None
    workspace_separate: bool | None = None


class SetDataDirectory(BaseModel):
    path: str


class SetExecutionsPath(BaseModel):
    path: str


class SetWorkspacePath(BaseModel):
    path: str


def _summary() -> dict[str, int]:
    wf = db.query("SELECT COUNT(*) AS c FROM workflows")[0]["c"]
    tasks = db.query("SELECT COUNT(*) AS c FROM tasks")[0]["c"]
    execs = db.query("SELECT COUNT(*) AS c FROM executions")[0]["c"]
    return {"workflows": wf, "tasks": tasks, "executions": execs}


def _settings_payload() -> dict[str, Any]:
    cfg = paths.load_config()
    return {
        "data_directory": cfg["data_directory"],
        "timezone": cfg["timezone"],
        "launch_on_startup": cfg["launch_on_startup"],
        "keep_running_in_background": cfg["keep_running_in_background"],
        "executions_separate": cfg["executions_separate"],
        "executions_path": cfg["executions_path"],
        "workspace_separate": cfg["workspace_separate"],
        "workspace_path": cfg["workspace_path"],
        "config_path": str(paths.config_path()),
        "summary": _summary(),
    }


@router.get("")
def get_settings() -> dict[str, Any]:
    return _settings_payload()


@router.patch("")
def patch_settings(body: PatchSettings) -> dict[str, Any]:
    cfg = paths.load_config()
    if body.timezone is not None:
        cfg["timezone"] = paths.normalize_timezone(body.timezone)
    if body.launch_on_startup is not None:
        cfg["launch_on_startup"] = body.launch_on_startup
    if body.keep_running_in_background is not None:
        cfg["keep_running_in_background"] = body.keep_running_in_background
    if body.executions_separate is not None:
        cfg["executions_separate"] = body.executions_separate
        # Seed the custom path from the data directory the first time it's enabled,
        # so the default custom location reads as "same as workflows and tasks".
        if body.executions_separate and not cfg.get("executions_path"):
            cfg["executions_path"] = cfg["data_directory"]
    if body.workspace_separate is not None:
        cfg["workspace_separate"] = body.workspace_separate
        if body.workspace_separate and not cfg.get("workspace_path"):
            cfg["workspace_path"] = cfg["data_directory"]
    paths.save_config(cfg)
    # The effective executions root may have moved; ensure it exists and re-index
    # so the DB reflects what's actually readable there (files are source of truth, §5).
    if body.executions_separate is not None:
        paths.ensure_dirs()
        db.reconcile()
    # The $WORKSPACE root holds only transient per-run dirs (no index) — just ensure it.
    if body.workspace_separate is not None:
        paths.ensure_dirs()
    return _settings_payload()


@router.post("/data-directory")
def set_data_directory(body: SetDataDirectory) -> dict[str, Any]:
    new_path = Path(body.path).expanduser()
    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(400, f"Cannot use data directory path: {e}") from e
    cfg = paths.load_config()
    cfg["data_directory"] = str(new_path)
    paths.save_config(cfg)
    # Re-point: ensure dirs, init the index for the new data directory, and
    # reconcile it against whatever YAML already lives there (§5).
    paths.ensure_dirs()
    db.init_db()
    db.reconcile()
    return _settings_payload()


@router.post("/executions")
def set_executions_path(body: SetExecutionsPath) -> dict[str, Any]:
    """Point the execution history at a custom root (and turn the override on)."""
    new_path = Path(body.path).expanduser()
    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(400, f"Cannot use executions path: {e}") from e
    cfg = paths.load_config()
    cfg["executions_path"] = str(new_path)
    cfg["executions_separate"] = True
    paths.save_config(cfg)
    # New root: create the executions subfolder and re-index from it (§5).
    paths.ensure_dirs()
    db.reconcile()
    return _settings_payload()


@router.post("/workspace")
def set_workspace_path(body: SetWorkspacePath) -> dict[str, Any]:
    """Point each execution's $WORKSPACE at a custom root (and turn the override on)."""
    new_path = Path(body.path).expanduser()
    try:
        new_path.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise HTTPException(400, f"Cannot use workspace path: {e}") from e
    cfg = paths.load_config()
    cfg["workspace_path"] = str(new_path)
    cfg["workspace_separate"] = True
    paths.save_config(cfg)
    # New root: create the workspace subfolder. No index — per-run dirs are transient.
    paths.ensure_dirs()
    return _settings_payload()
