"""Unit: YAML storage roundtrip + immutable versioning."""

from __future__ import annotations

import pytest

from app import storage


def test_create_and_read_workflow():
    meta = storage.create_workflow("My WF", description="hello")
    assert meta.name == "My WF"
    assert meta.latest_version == 1
    assert meta.id in storage.list_workflow_ids()

    v1 = storage.read_workflow_version(meta.id, 1)
    assert v1 is not None
    assert v1.name == "My WF"
    assert v1.version == 1


def test_save_workflow_version_bumps_version():
    meta = storage.create_workflow("WF")
    v2 = storage.save_workflow_version(
        meta.id, name="WF v2", description=None, params={}, stages=[]
    )
    assert v2.version == 2
    assert storage.workflow_version_numbers(meta.id) == [1, 2]
    # Prior version stays immutable.
    assert storage.read_workflow_version(meta.id, 1).name == "WF"


def test_delete_workflow():
    meta = storage.create_workflow("Doomed")
    assert storage.delete_workflow(meta.id) is True
    assert storage.read_workflow_meta(meta.id) is None
    assert storage.delete_workflow(meta.id) is False


def test_param_keys_validated_on_write():
    with pytest.raises(ValueError):
        storage.create_workflow("Bad", params={"lowercase": "x"})
