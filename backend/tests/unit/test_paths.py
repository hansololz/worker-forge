"""Unit: data-directory resolution + timezone normalization."""

from __future__ import annotations

from pathlib import Path

from app import paths


def test_worker_forge_home_wins(sandbox):
    # `sandbox` set WORKER_FORGE_HOME to <tmp>/data.
    assert paths.data_directory_root() == sandbox
    assert paths.workflows_dir() == sandbox / "workflows"
    assert paths.tasks_dir() == sandbox / "tasks"
    assert paths.executions_dir() == sandbox / "executions"
    assert paths.db_path() == sandbox / "agent.db"


def test_ensure_dirs_creates_tree(sandbox):
    paths.ensure_dirs()
    for d in (paths.workflows_dir(), paths.tasks_dir(), paths.executions_dir(), paths.workspaces_dir()):
        assert d.is_dir()


def test_normalize_timezone():
    assert paths.normalize_timezone(None) == "UTC"
    assert paths.normalize_timezone("") == "UTC"
    assert paths.normalize_timezone("Not/AZone") == "UTC"
    assert paths.normalize_timezone("America/Los_Angeles") == "America/Los_Angeles"
    assert paths.normalize_timezone("UTC") == "UTC"


def test_execution_workspace_layout(sandbox):
    ws = paths.execution_workspace("abc123")
    assert ws == sandbox / "workspaces" / "abc123" / "workspace"
    assert isinstance(ws, Path)
