"""Integration: launch a real workflow run and assert it executes end-to-end.

This is the highest-value test — it exercises storage, the index, the runner
thread pool, real subprocess steps, and per-step logging together.
"""

from __future__ import annotations

from tests.conftest import poll_execution


def test_launch_run_succeeds_and_logs(client, make_task, make_workflow):
    task = make_task(name="Greet", code="echo hello-from-step")
    wf = make_workflow(
        name="Run Me",
        stages=[{"tasks": [{"task_id": task["id"]}]}],
    )

    launched = client.post("/api/executions", json={"workflow_id": wf["id"]})
    assert launched.status_code == 201, launched.text
    exec_id = launched.json()["id"]

    done = poll_execution(client, exec_id)
    assert done["status"] == "succeeded", done

    # drill into the single step's log and assert the echo landed
    step = done["stages"][0]["tasks"][0]["attempts"][0]["steps"][0]
    log = client.get(f"/api/executions/{exec_id}/logs/{step['log_id']}").json()
    text = "\n".join(line["msg"] for line in log["lines"])
    assert "hello-from-step" in text


def test_failing_step_marks_failed(client, make_task, make_workflow):
    task = make_task(name="Boom", code="exit 3")
    wf = make_workflow(name="Will Fail", stages=[{"tasks": [{"task_id": task["id"]}]}])

    exec_id = client.post("/api/executions", json={"workflow_id": wf["id"]}).json()["id"]
    done = poll_execution(client, exec_id)
    assert done["status"] == "failed", done


def test_list_executions_paginated(client, make_task, make_workflow):
    task = make_task(code="echo ok")
    wf = make_workflow(stages=[{"tasks": [{"task_id": task["id"]}]}])
    exec_id = client.post("/api/executions", json={"workflow_id": wf["id"]}).json()["id"]
    poll_execution(client, exec_id)

    page = client.get("/api/executions").json()
    assert page["total"] >= 1
    assert any(it["id"] == exec_id for it in page["items"])
