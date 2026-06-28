"""Integration: /api/workflows CRUD + versioning."""

from __future__ import annotations


def test_workflow_crud_and_versioning(client, make_workflow):
    meta = make_workflow(name="Deploy")
    wf_id = meta["id"]

    # appears in list
    listed = client.get("/api/workflows").json()
    assert any(w["id"] == wf_id for w in listed)

    # fetch detail
    assert client.get(f"/api/workflows/{wf_id}").status_code == 200

    # save a new version -> version 2
    v2 = client.post(
        f"/api/workflows/{wf_id}/versions",
        json={"name": "Deploy v2", "params": {}, "stages": []},
    )
    assert v2.status_code == 201, v2.text
    assert v2.json()["version"] == 2

    # historical version still fetchable
    assert client.get(f"/api/workflows/{wf_id}/versions/1").json()["name"] == "Deploy"

    # delete
    assert client.delete(f"/api/workflows/{wf_id}").status_code == 204
    assert client.get(f"/api/workflows/{wf_id}").status_code == 404


def test_missing_workflow_is_404(client):
    assert client.get("/api/workflows/does-not-exist").status_code == 404
