"""Data directory and config path resolution.

App *config* lives at a fixed per-user OS path, separate from the data directory
(SPEC §4). Config holds the data-directory pointer plus app preferences; the data
directory holds the YAML file tree + the SQLite index.

Resolution order for the data directory:
  1. ``$WORKER_FORGE_HOME`` env var (wins; used for tests / overrides).
  2. ``data_directory`` field in config.json, if set.
  3. Default: ``<config-dir>/data`` subfolder.
"""

from __future__ import annotations

import json
import os
import sys
import zoneinfo
from pathlib import Path
from typing import Any

# settings.timezone is stored as a real IANA zone name (e.g. "America/Los_Angeles",
# "Europe/London", "Asia/Kolkata", "UTC"). The UI renders every UTC timestamp in
# this zone with DST applied per-instant, so the picker offers the full IANA list.

# The "0 time" fallback used when the machine timezone can't be determined.
DEFAULT_TIMEZONE = "UTC"


def normalize_timezone(value: str | None) -> str:
    """Coerce any stored/incoming timezone value to a valid IANA zone name.

    Accepts a current IANA name as-is and falls back to DEFAULT_TIMEZONE
    ("UTC") for anything unrecognized.
    """
    if not value:
        return DEFAULT_TIMEZONE
    value = value.strip()
    try:
        zoneinfo.ZoneInfo(value)  # validates against the system tz database
        return value
    except Exception:
        return DEFAULT_TIMEZONE


def _detect_iana_timezone() -> str:
    """Best-effort detection of the machine's IANA zone (DST-aware downstream).

    Order: ``TZ`` env var (if a valid zone), then the ``/etc/localtime`` symlink
    target (macOS/Linux), else DEFAULT_TIMEZONE. Detection only sets the initial
    default; the user can override it in Settings.
    """
    tz_env = os.environ.get("TZ")
    if tz_env:
        try:
            zoneinfo.ZoneInfo(tz_env)
            return tz_env
        except Exception:
            pass
    try:
        link = os.readlink("/etc/localtime")  # e.g. ".../zoneinfo/America/Los_Angeles"
        if "zoneinfo/" in link:
            cand = link.split("zoneinfo/", 1)[1]
            zoneinfo.ZoneInfo(cand)
            return cand
    except Exception:
        pass
    return DEFAULT_TIMEZONE


def _config_dir() -> Path:
    """Per-user OS config directory for the app (NOT the data directory)."""
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Worker Forge"
    if sys.platform.startswith("win"):
        base = os.environ.get("APPDATA")
        root = Path(base) if base else Path.home() / "AppData" / "Roaming"
        return root / "Worker Forge"
    # Linux / other: XDG
    base = os.environ.get("XDG_CONFIG_HOME")
    root = Path(base) if base else Path.home() / ".config"
    return root / "worker-forge"


def config_path() -> Path:
    """Absolute path to ``config.json``."""
    return _config_dir() / "config.json"


def default_data_directory() -> Path:
    """Default data directory (a subfolder of the config dir)."""
    return _config_dir() / "data"


def _read_config_file() -> dict[str, Any]:
    p = config_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def load_config() -> dict[str, Any]:
    """Load the app config, applying defaults for missing keys."""
    cfg = _read_config_file()
    env_home = os.environ.get("WORKER_FORGE_HOME")
    if env_home:
        data_dir = Path(env_home).expanduser()
    elif cfg.get("data_directory"):
        data_dir = Path(cfg["data_directory"]).expanduser()
    else:
        data_dir = default_data_directory()
    exec_path = cfg.get("executions_path")
    ws_path = cfg.get("workspace_path")
    return {
        "data_directory": str(data_dir),
        "timezone": normalize_timezone(cfg["timezone"]) if cfg.get("timezone") else _detect_iana_timezone(),
        "launch_on_startup": bool(cfg.get("launch_on_startup", True)),
        "keep_running_in_background": bool(cfg.get("keep_running_in_background", True)),
        # Execution history can optionally live outside the data directory (§4 / §8.8).
        # executions_path is the *root* that holds the `executions/` subfolder;
        # it defaults to the data directory and is only honored when executions_separate.
        "executions_separate": bool(cfg.get("executions_separate", False)),
        "executions_path": str(Path(exec_path).expanduser()) if exec_path else str(data_dir),
        # Each execution's $WORKSPACE (where it checks out repos and does its work) can
        # optionally live outside the data directory (§4 / §8.8). workspace_path is the
        # *root* that holds the `workspace/` subfolder; defaults to the data directory and
        # is only honored when workspace_separate.
        "workspace_separate": bool(cfg.get("workspace_separate", False)),
        "workspace_path": str(Path(ws_path).expanduser()) if ws_path else str(data_dir),
    }


def save_config(cfg: dict[str, Any]) -> None:
    """Persist the app config to disk (config dir is created if needed)."""
    p = config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(cfg, indent=2), encoding="utf-8")


def data_directory_root() -> Path:
    """Resolve the active data directory."""
    return Path(load_config()["data_directory"])


def workflows_dir() -> Path:
    return data_directory_root() / "workflows"


def tasks_dir() -> Path:
    return data_directory_root() / "tasks"


def executions_root() -> Path:
    """Root directory that holds the ``executions/`` subfolder.

    Defaults to the data directory; when the user enables a separate location
    (settings ``executions_separate``) it is the custom ``executions_path``.
    Existing run history is NOT migrated when this changes — old execution
    YAMLs stay at the previous root and drop out of the index (§5) on the next
    reconcile until the path points back at them.
    """
    cfg = load_config()
    if cfg.get("executions_separate") and cfg.get("executions_path"):
        return Path(cfg["executions_path"]).expanduser()
    return data_directory_root()


def executions_dir() -> Path:
    return executions_root() / "executions"


def workspace_root() -> Path:
    """Root directory that holds the ``workspaces/`` subfolder.

    Defaults to the data directory; when the user enables a separate location
    (settings ``workspace_separate``) it is the custom ``workspace_path``. Each
    execution gets its own directory ``workspaces/<exec_id>/workspace`` under
    here ($WORKSPACE); these are kept after the run for inspection. Per-run dirs
    are not migrated when this changes — only new runs land at the new root.
    """
    cfg = load_config()
    if cfg.get("workspace_separate") and cfg.get("workspace_path"):
        return Path(cfg["workspace_path"]).expanduser()
    return data_directory_root()


def workspaces_dir() -> Path:
    """Parent directory holding one per-execution workspace folder each."""
    return workspace_root() / "workspaces"


def execution_workspace(workspace_id: str) -> Path:
    """The $WORKSPACE for one execution: ``workspaces/<workspace_id>/workspace``.

    ``workspace_id`` is the execution's own UUID (Execution.workspace_id),
    distinct from its id so the two can diverge later. All stages/tasks/attempts
    of the run share this single directory; it is kept after the run (no cleanup).
    """
    return workspaces_dir() / workspace_id / "workspace"


def db_path() -> Path:
    return data_directory_root() / "agent.db"


def ensure_dirs() -> None:
    """Create the data directory and its subdirectories if missing."""
    for d in (workflows_dir(), tasks_dir(), executions_dir(), workspaces_dir()):
        d.mkdir(parents=True, exist_ok=True)
