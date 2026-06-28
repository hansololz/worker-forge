"""Integration: orphaned runs from an abrupt shutdown become `interrupted`.

A fresh process owns no live run thread, so any on-disk ``running`` / ``queued``
execution must be finalized on boot (SPEC §6, crash-safety).
"""

from __future__ import annotations

from app import runner, storage
from app.models import Execution, new_id, now_iso


def test_recover_orphans_finalizes_running(sandbox):
    orphan = Execution(
        id=new_id(),
        workspace_id=new_id(),
        workflow_id="wf",
        workflow_version=1,
        workflow_name="Ghost",
        status="running",
        started_at=now_iso(),
        stages=[],
    )
    storage.write_execution(orphan)

    recovered = runner.recover_orphans()
    assert orphan.id in recovered

    after = storage.read_execution(orphan.id)
    assert after is not None
    assert after.status == "interrupted"


def test_recover_orphans_noop_when_clean(sandbox):
    assert runner.recover_orphans() == []
