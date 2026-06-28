"""Integration: cron triggers — create, list, patch, delete + live next_at."""

from __future__ import annotations


def test_trigger_lifecycle(client, make_workflow):
    wf_id = make_workflow(name="Scheduled")["id"]

    created = client.post(
        f"/api/workflows/{wf_id}/triggers",
        json={"type": "cron", "cron": "*/5 * * * *", "enabled": True},
    )
    assert created.status_code == 201, created.text
    trig = created.json()
    assert trig["next_at"]  # live-computed for a cron trigger
    trig_id = trig["id"]

    # scoped + global listings both see it
    assert any(t["id"] == trig_id for t in client.get(f"/api/workflows/{wf_id}/triggers").json())
    assert any(t["id"] == trig_id for t in client.get("/api/triggers").json())

    # disable it
    patched = client.patch(f"/api/triggers/{trig_id}", json={"enabled": False})
    assert patched.status_code == 200, patched.text
    assert patched.json()["enabled"] is False

    assert client.delete(f"/api/triggers/{trig_id}").status_code == 204
