"""Unit: cron next-fire computation (pure, time-injected)."""

from __future__ import annotations

from datetime import datetime, timezone

from app import scheduler


def test_next_fire_none_for_blank():
    assert scheduler.next_fire_iso(None) is None
    assert scheduler.next_fire_iso("") is None


def test_next_fire_every_five_minutes():
    base = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    assert scheduler.next_fire_iso("*/5 * * * *", after=base) == "2026-01-01T00:05:00+00:00"


def test_next_fire_daily_midnight():
    base = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    assert scheduler.next_fire_iso("0 0 * * *", after=base) == "2026-01-02T00:00:00+00:00"


def test_next_fire_malformed_returns_none():
    assert scheduler.next_fire_iso("not a cron") is None
    assert scheduler.next_fire_iso("99 99 99 99 99") is None
