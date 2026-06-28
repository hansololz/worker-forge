"""Unit: runner param resolution (layered precedence, pure)."""

from __future__ import annotations

from app.models import EnvParam, TaskVersion, WorkflowVersion, new_id, now_iso
from app.runner import _resolve_params


def _wf(params):
    return WorkflowVersion(
        id=new_id(), version=1, name="wf", params=params, stages=[], created_at=now_iso()
    )


def _task(env):
    return TaskVersion(id=new_id(), version=1, name="t", env=env, created_at=now_iso())


def test_env_default_is_floor():
    task = _task([EnvParam(key="A", default="def"), EnvParam(key="B", default="bdef")])
    out = _resolve_params(_wf({}), {}, task, {})
    assert out == {"A": "def", "B": "bdef"}


def test_layer_precedence_last_wins():
    task = _task([EnvParam(key="A", default="def")])
    out = _resolve_params(
        _wf({"A": "wf"}),
        {"A": "ref"},
        task,
        {"A": "run"},
        {"A": "task"},
    )
    assert out["A"] == "task"  # per-task run param wins over everything


def test_partial_layers():
    task = _task([EnvParam(key="A", default="def")])
    assert _resolve_params(_wf({"A": "wf"}), {}, task, {})["A"] == "wf"
    assert _resolve_params(_wf({"A": "wf"}), {"A": "ref"}, task, {})["A"] == "ref"
    assert _resolve_params(_wf({"A": "wf"}), {"A": "ref"}, task, {"A": "run"})["A"] == "run"


def test_values_coerced_to_str():
    task = _task([])
    out = _resolve_params(_wf({"N": 7}), {}, task, {"B": True})
    assert out == {"N": "7", "B": "True"}
