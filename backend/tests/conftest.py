"""Shared pytest fixtures.

Every test runs in a throwaway data + config directory. ``paths.*`` re-reads
``WORKER_FORGE_HOME`` and ``_config_dir()`` on every call (no module-level
caching), so a per-test ``monkeypatch`` fully isolates the YAML tree, the SQLite
index, and the on-disk config — nothing leaks between tests and the developer's
real Worker Forge data is never touched.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

# Make the `app` package importable no matter what cwd pytest is invoked from.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture(autouse=True)
def sandbox(tmp_path, monkeypatch):
    """Isolate data dir (WORKER_FORGE_HOME) and config dir for one test."""
    from app import db, paths

    home = tmp_path / "data"
    cfg = tmp_path / "config"
    home.mkdir()
    cfg.mkdir()
    monkeypatch.setenv("WORKER_FORGE_HOME", str(home))
    # save_config() writes to _config_dir(); redirect it off the real machine.
    monkeypatch.setattr(paths, "_config_dir", lambda: cfg)
    paths.ensure_dirs()
    db.init_db()
    yield home


@pytest.fixture
def client():
    """A TestClient with the app lifespan active (dirs, index, scheduler)."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def make_task(client):
    """Factory: create a task with a single bash step, return its JSON meta."""

    def _make(name="Echo Task", code="echo hi", **extra):
        body = {"name": name, "steps": [{"name": "run", "lang": "bash", "code": code}]}
        body.update(extra)
        r = client.post("/api/tasks", json=body)
        assert r.status_code == 201, r.text
        return r.json()

    return _make


@pytest.fixture
def make_workflow(client):
    """Factory: create a workflow, return its JSON meta."""

    def _make(name="Test Workflow", stages=None, **extra):
        body = {"name": name}
        if stages is not None:
            body["stages"] = stages
        body.update(extra)
        r = client.post("/api/workflows", json=body)
        assert r.status_code == 201, r.text
        return r.json()

    return _make


def poll_execution(client, exec_id, terminal=None, timeout=15.0):
    """Poll an execution until it reaches a terminal status (or timeout)."""
    terminal = terminal or {"succeeded", "failed", "cancelled", "interrupted"}
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        r = client.get(f"/api/executions/{exec_id}")
        assert r.status_code == 200, r.text
        last = r.json()
        if last["status"] in terminal:
            return last
        time.sleep(0.1)
    raise AssertionError(f"execution {exec_id} not terminal in {timeout}s: {last and last['status']}")
