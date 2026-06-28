"""Integration: /api/settings get + patch (config writes to the sandbox)."""

from __future__ import annotations


def test_get_settings_reports_sandbox(client, sandbox):
    s = client.get("/api/settings").json()
    assert s["data_directory"] == str(sandbox)
    assert "timezone" in s
    assert "summary" in s and "workflows" in s["summary"]


def test_patch_settings_roundtrip(client):
    r = client.patch("/api/settings", json={"timezone": "America/Los_Angeles"})
    assert r.status_code == 200, r.text
    assert r.json()["timezone"] == "America/Los_Angeles"

    r2 = client.patch("/api/settings", json={"launch_on_startup": False})
    assert r2.json()["launch_on_startup"] is False
    # persisted across reads
    assert client.get("/api/settings").json()["timezone"] == "America/Los_Angeles"
