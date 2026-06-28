"""Unit: SQLite index — schema, auto-indexing, reconcile."""

from __future__ import annotations

from app import db, storage


def test_init_db_creates_schema():
    db.init_db()
    rows = db.query("SELECT name FROM sqlite_master WHERE type='table'")
    names = {r["name"] for r in rows}
    assert {"workflows", "tasks", "executions"} <= names


def test_storage_write_auto_indexes():
    meta = storage.create_workflow("Indexed")
    rows = db.query("SELECT id FROM workflows WHERE id=?", (meta.id,))
    assert len(rows) == 1


def test_reconcile_rebuilds_from_yaml():
    a = storage.create_workflow("A")
    b = storage.create_workflow("B")
    # Wipe the index out from under storage, then rebuild from the YAML tree.
    with db._lock, db.connect() as conn:
        conn.execute("DELETE FROM workflows")
    assert db.query("SELECT COUNT(*) c FROM workflows")[0]["c"] == 0

    db.reconcile()
    ids = {r["id"] for r in db.query("SELECT id FROM workflows")}
    assert {a.id, b.id} <= ids
