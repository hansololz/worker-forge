"""Integration: /api/tasks CRUD + versioning."""

from __future__ import annotations


def test_task_crud_and_versioning(client, make_task):
    meta = make_task(name="Build", code="echo build")
    task_id = meta["id"]

    assert any(t["id"] == task_id for t in client.get("/api/tasks").json())

    v1 = client.get(f"/api/tasks/{task_id}/versions/1").json()
    assert v1["name"] == "Build"
    assert v1["steps"][0]["code"] == "echo build"

    v2 = client.post(
        f"/api/tasks/{task_id}/versions",
        json={"name": "Build v2", "steps": [{"name": "run", "lang": "bash", "code": "echo v2"}]},
    )
    assert v2.status_code == 201, v2.text
    assert v2.json()["version"] == 2

    assert client.delete(f"/api/tasks/{task_id}").status_code == 204
    assert client.get(f"/api/tasks/{task_id}").status_code == 404
