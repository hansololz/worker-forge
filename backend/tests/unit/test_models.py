"""Unit: Pydantic models, vocab validation, id/time helpers."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models import (
    EnvParam,
    Execution,
    Step,
    TaskVersion,
    new_id,
    now_iso,
    validate_param_keys,
)


def test_env_param_key_must_be_upper_snake():
    EnvParam(key="API_KEY")  # valid
    EnvParam(key="_PRIVATE", default="x", required=True)
    for bad in ("lower", "1LEADING", "has-dash", "has space"):
        with pytest.raises(ValidationError):
            EnvParam(key=bad)


def test_step_defaults():
    s = Step(name="build")
    assert s.lang == "bash"
    assert s.code == ""
    assert s.description is None


def test_task_version_defaults():
    tv = TaskVersion(id=new_id(), version=1, name="t", created_at=now_iso())
    assert tv.interpreter == "bash"
    assert tv.retries == 0
    assert tv.timeout_sec is None
    assert tv.env == []
    assert tv.steps == []


def test_execution_status_default_is_queued():
    ex = Execution(
        id=new_id(),
        workspace_id=new_id(),
        workflow_id="wf",
        workflow_version=1,
        workflow_name="WF",
        started_at=now_iso(),
    )
    assert ex.status == "queued"
    assert ex.degraded is False
    assert ex.trigger == "manual"


def test_new_id_is_uuid4_string():
    a, b = new_id(), new_id()
    assert a != b
    assert len(a) == 36 and a.count("-") == 4


def test_now_iso_is_utc():
    iso = now_iso()
    assert iso.endswith("+00:00")


def test_validate_param_keys():
    validate_param_keys({"GOOD_KEY": "1", "_X": "2"})  # no raise
    for bad in ({"lower": "1"}, {"1BAD": "1"}, {"has-dash": "1"}):
        with pytest.raises(ValueError):
            validate_param_keys(bad)
