"""Background scheduler (SPEC §7).

Evaluates enabled cron triggers, computes ``next_at`` (via croniter), and at
fire time launches an execution (trigger=cron, actor="scheduler"). Disabled
triggers never fire. Runs while the backend is up; "keep running in background"
governs firing while the window is closed (conceptual — the backend can always
fire when alive).
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any

from croniter import croniter

from . import runner, storage

_TICK_SECONDS = 20.0


def next_fire_iso(cron: str | None, after: datetime | None = None) -> str | None:
    """Compute a cron trigger's next fire time as an ISO-8601 string (UTC).

    Triggers are stored in the immutable version file with no persisted
    ``next_at`` (SPEC §4.1); callers compute it live for display. Returns
    ``None`` for non-cron / blank / unparseable expressions.
    """
    if not cron:
        return None
    base = after or datetime.now(timezone.utc)
    try:
        return croniter(cron, base).get_next(datetime).isoformat()
    except (ValueError, KeyError):
        return None


def trigger_payload(t: Any, *, wf_id: str | None = None, wf_name: str | None = None) -> dict[str, Any]:
    """Serialize a Trigger with a live-computed ``next_at`` (SPEC §4.1).

    Shared by the workflow and standalone trigger routes so the enrichment lives
    in one place. ``wf_id``/``wf_name`` are added only when provided (the
    standalone /triggers responses carry them; the workflow-embedded ones don't).
    """
    d: dict[str, Any] = {
        **t.model_dump(),
        "next_at": next_fire_iso(t.cron) if t.type == "cron" else None,
    }
    if wf_id is not None:
        d["workflow_id"] = wf_id
    if wf_name is not None:
        d["workflow_name"] = wf_name
    return d


class Scheduler:
    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        # In-memory next-fire cache keyed by trigger id, storing (cron, next_fire).
        # The cron is kept so we can detect when a *newer workflow version* changed
        # a trigger's schedule: trigger ids are stable across versions, so without
        # this the old version's cron would keep firing until the stale time passed.
        self._next: dict[str, tuple[str, datetime]] = {}
        # Guards _next: the request thread can call refresh() (after a save) while
        # the scheduler thread is mid-tick. RLock so _tick can refresh while held.
        self._lock = threading.RLock()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="adave-scheduler", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        # Prime next-fire times on startup.
        self._refresh()
        while not self._stop.wait(_TICK_SECONDS):
            try:
                self._tick()
            except Exception:  # noqa: BLE001 — scheduler must never die
                continue

    def _enabled_cron_triggers(self) -> list[tuple[str, str, str]]:
        """Return (workflow_id, trigger_id, cron) for enabled cron triggers.

        Triggers are not indexed (SPEC §5): the scheduler loads them straight
        from each workflow's *latest version* YAML on every refresh/tick.
        Desktop scale, so scanning the version files is cheap and keeps the YAML
        the single source.
        """
        out: list[tuple[str, str, str]] = []
        for wf_id in storage.list_workflow_ids():
            ver = storage.latest_workflow_version(wf_id)
            if ver is None:
                continue
            for t in ver.triggers:
                if t.type == "cron" and t.enabled and t.cron:
                    out.append((wf_id, t.id, t.cron))
        return out

    def refresh(self) -> None:
        """Re-prime next-fire times now.

        Called from the request thread right after a workflow with triggers is
        saved, so a brand-new cron trigger is live immediately instead of after
        the next ~20s tick (SPEC §7). No-op if the scheduler isn't running.
        """
        if self._thread and self._thread.is_alive():
            self._refresh()

    def _refresh(self) -> None:
        now = datetime.now(timezone.utc)
        with self._lock:
            live = set()
            for _wf_id, tid, cron in self._enabled_cron_triggers():
                live.add(tid)
                cached = self._next.get(tid)
                # (Re)compute when the trigger is new, or when a newer workflow
                # version changed its cron — else the old schedule would persist.
                if cached is None or cached[0] != cron:
                    self._next[tid] = (cron, self._compute_next(cron, now))
            # Drop disabled/removed triggers from the cache (only the latest
            # version's enabled cron triggers are "live"; rest is ignored).
            for tid in list(self._next):
                if tid not in live:
                    self._next.pop(tid, None)

    @staticmethod
    def _compute_next(cron: str, after: datetime) -> datetime:
        return croniter(cron, after).get_next(datetime)

    def _tick(self) -> None:
        now = datetime.now(timezone.utc)
        self._refresh()
        with self._lock:
            due = [
                (wf_id, tid, cron)
                for wf_id, tid, cron in self._enabled_cron_triggers()
                if (c := self._next.get(tid)) is not None and now >= c[1]
            ]
            for _wf_id, tid, cron in due:
                self._next[tid] = (cron, self._compute_next(cron, now))
        # Launch outside the lock so a slow runner.launch never blocks refresh().
        for wf_id, _tid, _cron in due:
            self._fire(wf_id)

    def _fire(self, wf_id: str) -> None:
        meta = storage.read_workflow_meta(wf_id)
        if meta is None:
            return
        wf_version = storage.read_workflow_version(wf_id, meta.latest_version)
        if wf_version is None:
            return
        runner.launch(
            wf_id, wf_version, meta.name, run_params={},
            trigger="cron", actor="scheduler",
        )


_scheduler = Scheduler()


def start() -> None:
    _scheduler.start()


def stop() -> None:
    _scheduler.stop()


def refresh() -> None:
    _scheduler.refresh()
