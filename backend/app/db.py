"""SQLite index (SPEC §5). Rebuildable cache over the YAML source of truth.

Tables: workflows, tasks, executions. ``PRAGMA foreign_keys=ON`` is set per
connection. ``reconcile()`` scans the data-directory YAML and repopulates the index;
run on startup. Triggers are NOT indexed — they live in each workflow's YAML
meta and are read from there by the scheduler and list endpoints (SPEC §5).
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator

from . import paths, storage

_lock = threading.RLock()

SCHEMA = """
-- id only: nothing FK-references workflows; kept as a cheap id/count index.
-- All display fields live in the workflow's YAML meta (SPEC §5).
CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY
);
-- id only: nothing FK-references tasks; kept as a cheap id/count index (SPEC §5).
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY
);
-- Triggers are not indexed: they live in the workflow YAML meta (SPEC §5).
-- No FK to workflows: run history is retained when its workflow is deleted
-- (SPEC §8.3). All display fields are denormalized here, so no join is needed.
CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    workflow_id TEXT,
    workflow_version INTEGER,
    workflow_name TEXT,
    status TEXT,
    degraded INTEGER,
    trigger TEXT,
    actor TEXT,
    started_at TEXT,
    finished_at TEXT,
    duration_sec REAL
);
CREATE INDEX IF NOT EXISTS ix_executions_started ON executions(started_at);
-- Logs are not indexed: step->log mapping lives in execution.yaml (StepOutcome.log_id);
-- log content is served from the per-execution log directory.
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a connection with FKs enabled and row access by name."""
    conn = sqlite3.connect(str(paths.db_path()))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    paths.ensure_dirs()
    with _lock, connect() as conn:
        conn.executescript(SCHEMA)


# ---------------------------------------------------------------------------
# Index upserts (called automatically by storage on every write/delete, and by
# reconcile() on startup). Routes and the runner never index by hand.
# ---------------------------------------------------------------------------
def index_workflow(wf_id: str) -> None:
    meta = storage.read_workflow_meta(wf_id)
    if meta is None:
        return
    with _lock, connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO workflows (id) VALUES (?)", (meta.id,)
        )


def deindex_workflow(wf_id: str) -> None:
    with _lock, connect() as conn:
        conn.execute("DELETE FROM workflows WHERE id=?", (wf_id,))


def index_task(task_id: str) -> None:
    meta = storage.read_task_meta(task_id)
    if meta is None:
        return
    with _lock, connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO tasks (id) VALUES (?)", (meta.id,)
        )


def deindex_task(task_id: str) -> None:
    with _lock, connect() as conn:
        conn.execute("DELETE FROM tasks WHERE id=?", (task_id,))


def index_execution(exec_id: str) -> None:
    ex = storage.read_execution(exec_id)
    if ex is None:
        return
    with _lock, connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO executions "
            "(id,workflow_id,workflow_version,workflow_name,status,degraded,"
            "trigger,actor,started_at,finished_at,duration_sec) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (ex.id, ex.workflow_id, ex.workflow_version, ex.workflow_name,
             ex.status, 1 if ex.degraded else 0, ex.trigger, ex.actor,
             ex.started_at, ex.finished_at, ex.duration_sec),
        )


# ---------------------------------------------------------------------------
# Reconcile / reindex
# ---------------------------------------------------------------------------
def reconcile() -> None:
    """Rebuild the entire index from the YAML data directory."""
    with _lock, connect() as conn:
        for tbl in ("executions", "tasks", "workflows"):
            conn.execute(f"DELETE FROM {tbl}")
    for wf_id in storage.list_workflow_ids():
        index_workflow(wf_id)
    for task_id in storage.list_task_ids():
        index_task(task_id)
    for exec_id in storage.list_execution_ids():
        index_execution(exec_id)


def query(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    with _lock, connect() as conn:
        return conn.execute(sql, params).fetchall()
