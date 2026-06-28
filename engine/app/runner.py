"""Execution engine (SPEC §7).

- Stages run sequentially; tasks within a stage run in parallel (threads).
- A task = sequential steps under its interpreter (bash/python).
- stdout/stderr/system lines stream into the step's log YAML doc.
- Retries: auto-retry up to ``task.retries``; each try = a new 1-based attempt.
- continue_on_failure: a failed task does not abort the run -> finishes degraded.
- Abort: a failed task without continue_on_failure fails its stage; later stages
  stay queued; run is failed.
- Timeouts: kill a task after ``timeout_sec``.
- Param resolution: workflow params <- per-ref params <- submitted run params;
  injected as env vars into steps.

Executions run in background threads so the API stays responsive. Supports
run-level cancel, rerun, retry-from-failure, skip-failed, and task-scoped
cancel/skip/retry (a single task addressed by stage+task position).
"""

from __future__ import annotations

import os
import queue
import shutil
import signal
import subprocess
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from datetime import datetime, timezone
from typing import Any

from . import paths, storage
from .models import (
    Attempt,
    Execution,
    LogDoc,
    LogLine,
    StageOutcome,
    StepOutcome,
    TaskOutcome,
    TaskVersion,
    WorkflowVersion,
    new_id,
    now_iso,
)

# Per-execution cancel flags.
_cancel_flags: dict[str, threading.Event] = {}
# Per-task cancel flags, keyed "<exec_id>:<stage_idx>:<task_idx>" — let the UI
# cancel a single running task without aborting the whole run (the run loop OR's
# this with the run-level flag, see _AnyEvent).
_task_cancel_flags: dict[str, threading.Event] = {}
# Per-run live task-control command queues. While a stage is still running, the
# UI can skip/retry a failed task without disturbing its siblings: skip_task /
# retry_task enqueue a command here and the run loop (the sole writer of the
# in-memory Execution) applies it on its own thread. Keyed by exec id.
_task_commands: dict[str, queue.Queue] = {}
_flags_lock = threading.Lock()
# Tasks within a stage fan out onto this pool. The run loop itself runs on its
# own dedicated thread (see _start_thread), NOT this pool, so concurrent runs
# can never occupy every worker while blocking on their tasks' results.
_task_executor = ThreadPoolExecutor(max_workers=16, thread_name_prefix="adave-task")

# Live step subprocesses, keyed by the task's cancel key ("<exec>:<stage>:<task>").
# Cancel uses this to SIGKILL running processes *immediately* instead of only
# setting a flag the step's poll loop reads up to one tick (50ms) later. Each step
# runs in its own process group (start_new_session), so killing the group reaps any
# children the step spawned too.
_live_procs: dict[str, set[subprocess.Popen]] = {}
_procs_lock = threading.Lock()


def _register_proc(task_key: str, proc: subprocess.Popen) -> None:
    with _procs_lock:
        _live_procs.setdefault(task_key, set()).add(proc)


def _unregister_proc(task_key: str, proc: subprocess.Popen) -> None:
    with _procs_lock:
        procs = _live_procs.get(task_key)
        if procs is not None:
            procs.discard(proc)
            if not procs:
                _live_procs.pop(task_key, None)


def _hard_kill(proc: subprocess.Popen) -> None:
    """SIGKILL the step's whole process group — no grace period. Used on cancel so
    a run dies as fast as the OS allows, including any children the step spawned."""
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


def _kill_matching(predicate) -> None:
    """Immediately SIGKILL every live step process whose task key matches.
    Snapshot under the lock, then kill outside it (killpg can briefly block)."""
    with _procs_lock:
        targets = [p for k, procs in _live_procs.items() if predicate(k) for p in procs]
    for proc in targets:
        _hard_kill(proc)


def _cancel_event(exec_id: str) -> threading.Event:
    with _flags_lock:
        ev = _cancel_flags.get(exec_id)
        if ev is None:
            ev = threading.Event()
            _cancel_flags[exec_id] = ev
        return ev


def _task_cancel_key(exec_id: str, stage_idx: int, task_idx: int) -> str:
    return f"{exec_id}:{stage_idx}:{task_idx}"


def _task_cancel_event(exec_id: str, stage_idx: int, task_idx: int) -> threading.Event:
    with _flags_lock:
        key = _task_cancel_key(exec_id, stage_idx, task_idx)
        ev = _task_cancel_flags.get(key)
        if ev is None:
            ev = threading.Event()
            _task_cancel_flags[key] = ev
        return ev


def _clear_task_flags(exec_id: str) -> None:
    """Drop all per-task cancel flags for a run (called when (re)starting it, so
    a stale single-task cancel can't bleed into a fresh attempt)."""
    with _flags_lock:
        prefix = exec_id + ":"
        for key in [k for k in _task_cancel_flags if k.startswith(prefix)]:
            _task_cancel_flags.pop(key, None)


def _clear_one_task_flag(exec_id: str, stage_idx: int, task_idx: int) -> None:
    """Drop a single task's cancel flag so a live retry of a previously-cancelled
    task isn't SIGKILLed on spawn by its own stale flag."""
    with _flags_lock:
        _task_cancel_flags.pop(_task_cancel_key(exec_id, stage_idx, task_idx), None)


def _command_queue(exec_id: str) -> queue.Queue:
    with _flags_lock:
        q = _task_commands.get(exec_id)
        if q is None:
            q = queue.Queue()
            _task_commands[exec_id] = q
        return q


def _enqueue_task_command(exec_id: str, command: tuple) -> None:
    """Hand a live skip/retry command to the run thread (see _task_commands)."""
    _command_queue(exec_id).put(command)


def _clear_task_commands(exec_id: str) -> None:
    with _flags_lock:
        _task_commands.pop(exec_id, None)


class _AnyEvent:
    """Cancel signal that fires when *any* underlying event is set. Used to OR a
    task's own cancel flag with the run-level one; only ``.is_set()`` is read
    downstream (_run_task / _run_attempt / _exec_step), so this duck-types as an
    Event."""

    def __init__(self, *events: threading.Event) -> None:
        self._events = events

    def is_set(self) -> bool:
        return any(ev.is_set() for ev in self._events)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _dur(start: datetime, end: datetime) -> float:
    return round((end - start).total_seconds(), 3)


# ---------------------------------------------------------------------------
# Param resolution
# ---------------------------------------------------------------------------
def _resolve_params(
    wf_version: WorkflowVersion,
    ref_params: dict[str, Any],
    task_def: TaskVersion,
    run_params: dict[str, Any],
    task_run_params: dict[str, Any] | None = None,
) -> dict[str, str]:
    """task env defaults <- wf params <- per-ref params <- global run params
    <- per-task run params. The last layer keeps each task's env isolated even
    when two tasks in a stage share a param name with different values.
    """
    merged: dict[str, Any] = {}
    for e in task_def.env:
        merged[e.key] = e.default
    merged.update(wf_version.params)
    merged.update(ref_params)
    merged.update(run_params)
    merged.update(task_run_params or {})
    return {k: str(v) for k, v in merged.items()}


# ---------------------------------------------------------------------------
# Execution creation
# ---------------------------------------------------------------------------
def build_execution(
    wf_id: str,
    wf_version: WorkflowVersion,
    wf_name: str,
    run_params: dict[str, Any],
    trigger: str,
    actor: str,
    task_params: dict[str, dict[str, Any]] | None = None,
) -> Execution:
    """Build the initial (queued) execution graph from a workflow version."""
    stages: list[StageOutcome] = []
    for i, stage in enumerate(wf_version.stages):
        tasks: list[TaskOutcome] = []
        for ref in stage.tasks:
            if not ref.enabled:
                continue
            # Resolve "latest" (None) to a concrete version once, at build time,
            # so the whole run is pinned to a single deterministic version.
            version = storage.resolve_task_version(ref.task_id, ref.task_version)
            task_def = storage.read_task_version(ref.task_id, version)
            name = task_def.name if task_def else ref.task_id
            tasks.append(
                TaskOutcome(
                    task_id=ref.task_id,
                    task_version=version,
                    name=name,
                    status="queued",
                    continue_on_failure=ref.continue_on_failure,
                    params=ref.params,
                    attempts=[],
                )
            )
        stages.append(StageOutcome(index=i, status="queued", tasks=tasks))

    return Execution(
        id=new_id(),
        workspace_id=new_id(),
        workflow_id=wf_id,
        workflow_version=wf_version.version,
        workflow_name=wf_name,
        status="running",
        degraded=False,
        trigger=trigger,
        actor=actor,
        params=run_params,
        task_params=task_params or {},
        started_at=now_iso(),
        finished_at=None,
        duration_sec=None,
        stages=stages,
    )


def launch(
    wf_id: str,
    wf_version: WorkflowVersion,
    wf_name: str,
    run_params: dict[str, Any],
    trigger: str,
    actor: str,
    task_params: dict[str, dict[str, Any]] | None = None,
) -> Execution:
    """Create + persist a running execution and start it in the background."""
    task_params = task_params or {}
    ex = build_execution(
        wf_id, wf_version, wf_name, run_params, trigger, actor, task_params
    )
    storage.write_execution(ex)
    _start_thread(ex.id, wf_version, run_params, task_params, start_stage=0)
    return ex


def _start_thread(
    exec_id: str,
    wf_version: WorkflowVersion,
    run_params: dict[str, Any],
    task_params: dict[str, dict[str, Any]],
    start_stage: int,
) -> None:
    _cancel_event(exec_id).clear()
    _clear_task_flags(exec_id)
    _clear_task_commands(exec_id)
    threading.Thread(
        target=_run_execution,
        args=(exec_id, wf_version, run_params, task_params, start_stage),
        name=f"adave-run-{exec_id[:8]}",
        daemon=True,
    ).start()


# ---------------------------------------------------------------------------
# Step execution
# ---------------------------------------------------------------------------
def _append_line(log: LogDoc, stream: str, msg: str) -> None:
    log.lines.append(LogLine(ts=now_iso(), stream=stream, msg=msg))


def _run_task(
    exec_id: str,
    stage_idx: int,
    ref_params: dict[str, Any],
    wf_version: WorkflowVersion,
    run_params: dict[str, Any],
    task_outcome: TaskOutcome,
    cancel: threading.Event,
    workdir: str,
    task_run_params: dict[str, Any] | None = None,
    task_key: str = "",
) -> None:
    """Run one task: its steps sequentially, with auto-retry. Mutates
    ``task_outcome`` in place. Persistence happens via the caller's snapshots.
    """
    task_def = storage.read_task_version(task_outcome.task_id, task_outcome.task_version)
    if task_def is None:
        task_outcome.status = "failed"
        return

    env_vars = _resolve_params(
        wf_version, ref_params, task_def, run_params, task_run_params
    )
    # Record what the task actually ran with so the run view can show it, and flag
    # any key the task's env doesn't declare as an ad-hoc "added" param.
    declared = {e.key for e in task_def.env}
    task_outcome.params = dict(env_vars)
    task_outcome.added_params = [k for k in env_vars if k not in declared]
    retries_allowed = task_def.retries
    timeout_sec = task_def.timeout_sec

    task_start = _now()
    # Attempts are append-only history: a manual retry preserves the prior run's
    # attempts and numbers new ones after them. ``attempt_no`` tracks only THIS
    # run's auto-retry budget; ``prior_attempts`` offsets the displayed index.
    prior_attempts = len(task_outcome.attempts)
    attempt_no = 0
    final_ok = False

    while attempt_no <= retries_allowed:
        if cancel.is_set():
            break
        attempt_no += 1
        attempt = Attempt(
            index=prior_attempts + attempt_no,
            status="running",
            started_at=now_iso(),
            timeout_sec=timeout_sec,
            retries_used=attempt_no - 1,
            retries_allowed=retries_allowed,
            steps=[],
        )
        task_outcome.attempts.append(attempt)
        task_outcome.status = "running"
        att_start = _now()

        ok = _run_attempt(
            exec_id, stage_idx, task_outcome, attempt, task_def,
            env_vars, timeout_sec, cancel, workdir, task_key,
        )
        att_end = _now()
        attempt.finished_at = now_iso()
        attempt.duration_sec = _dur(att_start, att_end)

        if cancel.is_set():
            attempt.status = "cancelled"
            task_outcome.status = "cancelled"
            break
        if ok:
            attempt.status = "succeeded"
            final_ok = True
            break
        attempt.status = "failed"
        # else: loop to retry if attempts remain

    task_outcome.duration_sec = _dur(task_start, _now())
    if cancel.is_set() and task_outcome.status != "succeeded":
        task_outcome.status = "cancelled"
    elif final_ok:
        task_outcome.status = "succeeded"
    else:
        task_outcome.status = "failed"


def _run_attempt(
    exec_id: str,
    stage_idx: int,
    task_outcome: TaskOutcome,
    attempt: Attempt,
    task_def: TaskVersion,
    env_vars: dict[str, str],
    timeout_sec: int | None,
    cancel: threading.Event,
    workdir: str,
    task_key: str = "",
) -> bool:
    """Run the task's steps sequentially. Returns True if all steps succeed.

    ``workdir`` is the execution's shared $WORKSPACE (§8.8) — the same directory
    for every stage/task/attempt of the run; it is not cleaned up here.
    """
    base_env = os.environ.copy()
    base_env.update(env_vars)
    base_env["WORKSPACE"] = workdir
    base_env.setdefault("DATA_DIRECTORY", workdir)
    deadline = time.monotonic() + timeout_sec if timeout_sec else None
    all_ok = True
    for step in task_def.steps:
        log = LogDoc(
            id=new_id(),
            execution_id=exec_id,
            stage_index=stage_idx,
            task_id=task_outcome.task_id,
            attempt=attempt.index,
            step_name=step.name,
            status="running",
            lines=[],
        )
        outcome = StepOutcome(name=step.name, status="running", log_id=log.id)
        attempt.steps.append(outcome)

        if not all_ok:
            outcome.status = "skipped"
            log.status = "skipped"
            _append_line(log, "system", "Skipped (prior step failed)")
            storage.write_log(log)
            continue

        remaining = None
        if deadline is not None:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                outcome.status = "failed"
                log.status = "failed"
                _append_line(log, "system", "Timed out before step start")
                storage.write_log(log)
                all_ok = False
                continue

        ok = _exec_step(step, base_env, workdir, log, cancel, remaining, task_key)
        outcome.status = "succeeded" if ok else "failed"
        log.status = outcome.status
        storage.write_log(log)
        if not ok:
            all_ok = False
    return all_ok


def _exec_step(
    step: Any,
    env: dict[str, str],
    cwd: str,
    log: LogDoc,
    cancel: threading.Event,
    timeout: float | None,
    task_key: str = "",
) -> bool:
    """Run a single step's code under bash/python, streaming output to ``log``."""
    lang = step.lang or "bash"
    if lang == "python":
        interp = shutil.which("python3") or shutil.which("python") or "python3"
        cmd = [interp, "-u", "-c", step.code]
    else:
        interp = shutil.which("bash") or "/bin/bash"
        cmd = [interp, "-c", step.code]

    _append_line(log, "system", f"$ {step.name} ({lang})")
    # If a cancel landed between the run loop's check and here, never spawn.
    if cancel.is_set():
        _append_line(log, "system", "Step cancelled")
        return False
    try:
        proc = subprocess.Popen(
            cmd, cwd=cwd, env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, bufsize=1,
            # Own process group so cancel can SIGKILL the step and every child it
            # spawned in one syscall (see _hard_kill / _terminate).
            start_new_session=True,
        )
    except OSError as e:
        _append_line(log, "stderr", f"Failed to launch interpreter: {e}")
        return False

    # Register before reading so a concurrent cancel can find and kill us. A cancel
    # that fired between the spawn and here is caught by the is_set() check below.
    _register_proc(task_key, proc)
    threads = [
        _stream_reader(proc.stdout, "stdout", log),
        _stream_reader(proc.stderr, "stderr", log),
    ]

    start = time.monotonic()
    killed_timeout = False
    try:
        while proc.poll() is None:
            if cancel.is_set():
                _hard_kill(proc)  # immediate SIGKILL; no grace on cancel
                break
            if timeout is not None and (time.monotonic() - start) > timeout:
                killed_timeout = True
                _terminate(proc)
                break
            time.sleep(0.05)
    finally:
        _unregister_proc(task_key, proc)

    for t in threads:
        t.join(timeout=2)
    rc = proc.wait()

    # Cancel wins over timeout/exit-code reporting: the process may have been
    # SIGKILLed directly by cancel() before the poll loop even noticed.
    if cancel.is_set():
        _append_line(log, "system", "Step cancelled")
        return False
    if killed_timeout:
        _append_line(log, "system", "Step timed out and was killed")
        return False
    _append_line(log, "system", f"exit {rc}")
    return rc == 0


def _stream_reader(pipe: Any, stream: str, log: LogDoc) -> threading.Thread:
    def _read() -> None:
        if pipe is None:
            return
        for raw in iter(pipe.readline, ""):
            _append_line(log, stream, raw.rstrip("\n"))
        pipe.close()

    t = threading.Thread(target=_read, daemon=True)
    t.start()
    return t


def _terminate(proc: subprocess.Popen) -> None:
    """Graceful stop (used for timeouts): SIGTERM the process group, then SIGKILL
    the group if it lingers. Cancel uses _hard_kill instead (no grace)."""
    try:
        pgid = os.getpgid(proc.pid)
    except ProcessLookupError:
        return
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(pgid, signal.SIGKILL)
        except ProcessLookupError:
            pass


# ---------------------------------------------------------------------------
# Run loop
# ---------------------------------------------------------------------------
def _persist(ex: Execution) -> None:
    storage.write_execution(ex)


def _stage_signature(stage: StageOutcome) -> tuple:
    """Cheap snapshot of a running stage's progress: per-task status plus each
    attempt's status and its steps' statuses. Worker threads mutate these in
    place as attempts/steps start and finish; the run loop compares signatures
    between polls so an in-flight attempt (and its live step states) is flushed
    to disk as soon as it appears — not only when the task finishes."""
    return tuple(
        (
            t.status,
            tuple(
                (a.status, tuple(s.status for s in a.steps)) for a in t.attempts
            ),
        )
        for t in stage.tasks
    )


def _run_execution(
    exec_id: str,
    wf_version: WorkflowVersion,
    run_params: dict[str, Any],
    task_params: dict[str, dict[str, Any]],
    start_stage: int,
) -> None:
    cancel = _cancel_event(exec_id)
    ex = storage.read_execution(exec_id)
    if ex is None:
        return
    ex.status = "running"
    _persist(ex)

    # $WORKSPACE: one directory per execution, shared by every stage/task/attempt
    # (§8.8). Named by ex.workspace_id (a distinct UUID from exec_id, so the two
    # can diverge later). Created once here; kept after the run (no cleanup).
    # Idempotent so retry-from-failure reuses the same dir.
    ws = paths.execution_workspace(ex.workspace_id)
    ws.mkdir(parents=True, exist_ok=True)
    workdir = str(ws)

    # Flattened slot index per stage = count of tasks in all prior stages. Run
    # params are keyed by this slot (matches the run-prepare page's numbering).
    slot_base = [0] * len(ex.stages)
    for j in range(1, len(ex.stages)):
        slot_base[j] = slot_base[j - 1] + len(ex.stages[j - 1].tasks)

    aborted = False
    for si in range(start_stage, len(ex.stages)):
        stage = ex.stages[si]
        if cancel.is_set():
            break
        # Skip stages already terminal (e.g. from retry-from-failure). Pair each
        # runnable task with its index in the stage so a single-task cancel can
        # target it (TaskOutcome has no unique id — two refs may share task_id).
        runnable = [(ti, t) for ti, t in enumerate(stage.tasks) if t.status == "queued"]
        if not runnable and stage.status in ("succeeded", "failed", "skipped"):
            continue

        stage.status = "running"
        _persist(ex)

        def _run_one(task_idx: int, task_outcome: TaskOutcome) -> None:
            # Run params are keyed by the task's flattened slot index, so two refs
            # of the same task in different stages keep distinct run-time values.
            # OR the run-level cancel with this task's own flag so the UI can
            # stop just this task while the rest of the run carries on.
            task_cancel = _AnyEvent(cancel, _task_cancel_event(exec_id, si, task_idx))
            task_key = _task_cancel_key(exec_id, si, task_idx)
            slot = str(slot_base[si] + task_idx)
            _run_task(
                exec_id, si, task_outcome.params,
                wf_version, run_params, task_outcome, task_cancel, workdir,
                task_params.get(slot, {}), task_key,
            )

        # Mark tasks running and persist before submitting: the stage runs to
        # completion before the next _persist, so a frontend poll in between
        # would otherwise read these tasks as still "queued".
        for _, t in runnable:
            t.status = "running"
        _persist(ex)

        running_futs: dict[Any, int] = {
            _task_executor.submit(_run_one, ti, t): ti for ti, t in runnable
        }
        if not runnable:
            _persist(ex)  # nothing ran (e.g. resume): still snapshot the stage

        # Supervise the stage until every task is terminal. Persist whenever the
        # stage's progress changes — a task finishing, but also an attempt or
        # step *starting* — so an in-flight (running) attempt shows up within one
        # poll interval, not only once the task is done. Between waits, drain any
        # live skip/retry commands the UI enqueued for a failed task — applied
        # here (the sole ex writer) so a single task is skipped/re-run WITHOUT
        # disturbing its still-running siblings.
        cmd_q = _command_queue(exec_id)
        last_sig = None
        while running_futs:
            done, _pending = wait(
                list(running_futs), timeout=0.2, return_when=FIRST_COMPLETED
            )
            for f in done:
                running_futs.pop(f, None)
                f.result()
            while True:
                try:
                    kind, c_si, c_ti = cmd_q.get_nowait()
                except queue.Empty:
                    break
                if c_si != si or not (0 <= c_ti < len(stage.tasks)):
                    continue
                t = stage.tasks[c_ti]
                if t.status not in ("failed", "cancelled"):
                    continue
                if kind == "skip":
                    t.status = "skipped"
                    ex.degraded = True
                elif kind == "retry":
                    _clear_one_task_flag(exec_id, si, c_ti)
                    t.status = "queued"
                    t.duration_sec = None
                    t.continued = False
                    running_futs[_task_executor.submit(_run_one, c_ti, t)] = c_ti
            sig = _stage_signature(stage)
            if sig != last_sig:
                _persist(ex)
                last_sig = sig

        # Evaluate stage outcome.
        stage_failed = False
        for t in stage.tasks:
            if t.status == "failed":
                if t.continue_on_failure:
                    t.continued = True
                    ex.degraded = True
                else:
                    stage_failed = True
            elif t.status == "cancelled":
                if cancel.is_set():
                    # whole-run cancel: this stage is cancelling, handled below.
                    stage_failed = True
                else:
                    # single-task cancel: the run carries on but is left degraded
                    # so the cancelled task is retriable from a non-clean result.
                    ex.degraded = True

        if cancel.is_set():
            stage.status = "cancelled"
            aborted = True
            _persist(ex)
            break

        if stage_failed:
            stage.status = "failed"
            ex.status = "failed"
            # Later stages never run — they're cancelled at finalize below
            # (queued is never a final per-task status on a terminated run).
            aborted = True
            _persist(ex)
            break

        stage.status = "succeeded"
        _persist(ex)

    end = _now()
    ex.finished_at = now_iso()
    try:
        started = datetime.fromisoformat(ex.started_at)
        ex.duration_sec = _dur(started, end)
    except ValueError:
        ex.duration_sec = None

    if cancel.is_set():
        ex.status = "cancelled"
        _mark_unstarted_cancelled(ex)
    elif aborted:
        # aborted via failure (ex.status already 'failed'): the remaining queued
        # tasks never ran — a terminated run cancels them, so queued/running are
        # never a final per-task status on a completed run.
        _mark_unstarted_cancelled(ex)
    else:
        ex.status = "succeeded"
    _persist(ex)
    with _flags_lock:
        _cancel_flags.pop(exec_id, None)
        _task_commands.pop(exec_id, None)


def _mark_unstarted_cancelled(ex: Execution) -> None:
    for stage in ex.stages:
        if stage.status == "queued":
            stage.status = "cancelled"
        for t in stage.tasks:
            if t.status in ("queued", "running"):
                t.status = "cancelled"


# ---------------------------------------------------------------------------
# Controls
# ---------------------------------------------------------------------------
def cancel(exec_id: str) -> bool:
    ex = storage.read_execution(exec_id)
    if ex is None or ex.status not in ("running", "queued"):
        return False
    _cancel_event(exec_id).set()
    # Kill every live step process for this run *now* — don't wait for each step's
    # poll loop to notice the flag. Keys are "<exec>:<stage>:<task>".
    _kill_matching(lambda k: k.startswith(exec_id + ":"))
    return True


def _load_wf_version(ex: Execution) -> WorkflowVersion | None:
    return storage.read_workflow_version(ex.workflow_id, ex.workflow_version)


def rerun(exec_id: str) -> Execution | None:
    ex = storage.read_execution(exec_id)
    if ex is None:
        return None
    wf_version = _load_wf_version(ex)
    if wf_version is None:
        return None
    meta = storage.read_workflow_meta(ex.workflow_id)
    name = meta.name if meta else ex.workflow_name
    return launch(
        ex.workflow_id, wf_version, name, ex.params,
        trigger="manual", actor="user", task_params=ex.task_params,
    )


def retry_from_failure(exec_id: str) -> Execution | None:
    """Run-level retry: re-run from the stop stage, resuming to completion.

    Retries every stuck (failed/cancelled) task in the stopping stage and re-runs
    all later stages, so the run resumes to completion; already-succeeded tasks
    are left untouched. Works on a failed or cancelled run."""
    ex = storage.read_execution(exec_id)
    if ex is None or ex.status not in ("failed", "cancelled"):
        return None
    wf_version = _load_wf_version(ex)
    if wf_version is None:
        return None

    stop_stage = None
    for stage in ex.stages:
        if stage.status in ("failed", "cancelled"):
            stop_stage = stage.index
            break
    if stop_stage is None:
        return None

    # Reset stuck (failed/cancelled) tasks in the stop stage to queued (drop their
    # attempts); reset the stop stage + later stages so the loop reprocesses them.
    failed_stage = stop_stage
    for stage in ex.stages:
        if stage.index < failed_stage:
            continue
        if stage.index == failed_stage:
            stage.status = "running"
            for t in stage.tasks:
                if t.status in ("failed", "cancelled"):
                    # Keep the failed attempt(s); the retry appends new ones.
                    t.status = "queued"
                    t.duration_sec = None
                    t.continued = False
        else:
            stage.status = "queued"
            for t in stage.tasks:
                t.status = "queued"
                t.attempts = []
                t.duration_sec = None
                t.continued = False

    # Recompute degraded from tolerated failures in the (kept) earlier stages;
    # the re-run loop will OR in any new ones. Otherwise a clean retry would
    # still report degraded from the prior attempt.
    ex.degraded = any(
        t.continued for s in ex.stages if s.index < failed_stage for t in s.tasks
    )
    ex.status = "running"
    ex.finished_at = None
    ex.duration_sec = None
    _persist(ex)
    _start_thread(
        exec_id, wf_version, ex.params, ex.task_params, start_stage=failed_stage
    )
    return ex


def skip_failed(exec_id: str) -> Execution | None:
    """Run-level: skip every failure and finish all remaining stages.

    Every failed task across the run is marked ``skipped``; every still-pending
    task (``queued``/``cancelled``) completes as ``succeeded`` and all stages
    finish, so the run completes as ``succeeded`` + ``degraded`` (continued).
    Distinct from the per-task ``skip`` which advances exactly one stage."""
    ex = storage.read_execution(exec_id)
    if ex is None or ex.status not in ("failed", "cancelled"):
        return None

    stuck = False
    for stage in ex.stages:
        for t in stage.tasks:
            if t.status == "failed":
                t.status = "skipped"
                stuck = True
            elif t.status in ("queued", "cancelled"):
                t.status = "succeeded"
                stuck = True
        stage.status = "succeeded"
    if not stuck:
        return None

    ex.degraded = True
    ex.status = "succeeded"
    if ex.finished_at is None:
        ex.finished_at = now_iso()
        try:
            started = datetime.fromisoformat(ex.started_at)
            ex.duration_sec = _dur(started, _now())
        except ValueError:
            pass
    _persist(ex)
    return ex


# ---------------------------------------------------------------------------
# Task-scoped controls (single task within a run; SPEC §7)
# ---------------------------------------------------------------------------
def _locate_task(
    ex: Execution, stage_index: int, task_index: int
) -> TaskOutcome | None:
    """Resolve (stage_index, task_index) to a task, or None if out of range.
    Tasks are positional — TaskOutcome has no unique id within a stage."""
    if not 0 <= stage_index < len(ex.stages):
        return None
    stage = ex.stages[stage_index]
    if not 0 <= task_index < len(stage.tasks):
        return None
    return stage.tasks[task_index]


def cancel_task(exec_id: str, stage_index: int, task_index: int) -> bool:
    """Stop a single running/queued task; the rest of the run carries on.

    Signals the task's own cancel flag and immediately SIGKILLs its live step
    process group (children included) — it is not left to die on the next poll. A
    still-queued task is cancelled before it starts. The run loop does not fail the
    stage on a single-task cancel (see _run_execution)."""
    ex = storage.read_execution(exec_id)
    if ex is None or ex.status not in ("running", "queued"):
        return False
    task = _locate_task(ex, stage_index, task_index)
    if task is None or task.status not in ("running", "queued"):
        return False
    _task_cancel_event(exec_id, stage_index, task_index).set()
    # Kill just this task's live step process immediately; the run carries on.
    key = _task_cancel_key(exec_id, stage_index, task_index)
    _kill_matching(lambda k: k == key)
    return True


def skip_task(exec_id: str, stage_index: int, task_index: int) -> Execution | None:
    """Mark one failed/cancelled/queued task skipped on a terminal run.

    If skipping clears the last blocker in a failed/cancelled stage, that stage
    is marked succeeded and the run resumes from the next stage; otherwise the
    task is simply recorded skipped and the run stays in its terminal state."""
    ex = storage.read_execution(exec_id)
    if ex is None:
        return None
    task = _locate_task(ex, stage_index, task_index)
    if task is None:
        return None

    # Live: a failed task in a still-running stage. Hand the skip to the run
    # thread, which marks it skipped without touching its running siblings.
    if ex.status == "running":
        if ex.stages[stage_index].status == "running" and task.status in (
            "failed",
            "cancelled",
        ):
            _enqueue_task_command(exec_id, ("skip", stage_index, task_index))
            return ex
        return None

    if ex.status not in ("failed", "cancelled"):
        return None
    if task.status not in ("failed", "cancelled", "queued"):
        return None

    task.status = "skipped"
    ex.degraded = True
    stage = ex.stages[stage_index]

    # If this was the stage that blocked the run and nothing failing remains,
    # finish the stage and resume the run from the next stage.
    blocked = stage.status in ("failed", "cancelled")
    still_failing = any(t.status in ("failed", "cancelled") for t in stage.tasks)
    if blocked and not still_failing:
        wf_version = _load_wf_version(ex)
        if wf_version is None:
            return None
        stage.status = "succeeded"
        ex.status = "running"
        ex.finished_at = None
        ex.duration_sec = None
        _persist(ex)
        _start_thread(
            exec_id, wf_version, ex.params, ex.task_params,
            start_stage=stage_index + 1,
        )
        return ex

    _persist(ex)
    return ex


def retry_task(exec_id: str, stage_index: int, task_index: int) -> Execution | None:
    """Re-run a single failed/cancelled task on a terminal run.

    The target task is reset to queued and its stage re-opened; later stages are
    reset to queued too (their results depend on this task). The run resumes
    from the target stage, where only the reset task is runnable."""
    ex = storage.read_execution(exec_id)
    if ex is None:
        return None
    task = _locate_task(ex, stage_index, task_index)
    if task is None:
        return None

    # Live: a failed task in a still-running stage. Hand the retry to the run
    # thread, which re-runs just this task in place — siblings keep running and
    # later stages are untouched (they never started).
    if ex.status == "running":
        if ex.stages[stage_index].status == "running" and task.status in (
            "failed",
            "cancelled",
        ):
            _enqueue_task_command(exec_id, ("retry", stage_index, task_index))
            return ex
        return None

    if ex.status not in ("failed", "cancelled"):
        return None
    if task.status not in ("failed", "cancelled"):
        return None
    wf_version = _load_wf_version(ex)
    if wf_version is None:
        return None

    # Keep the failed attempt(s) — a retry appends new attempts so the prior
    # try stays visible in the run's attempt history.
    task.status = "queued"
    task.duration_sec = None
    task.continued = False
    ex.stages[stage_index].status = "running"

    # Later stages re-run from scratch — their inputs may change.
    for stage in ex.stages:
        if stage.index <= stage_index:
            continue
        stage.status = "queued"
        for t in stage.tasks:
            t.status = "queued"
            t.attempts = []
            t.duration_sec = None
            t.continued = False

    # Degraded carries over only from tolerated failures in earlier stages.
    ex.degraded = any(
        t.continued for s in ex.stages if s.index < stage_index for t in s.tasks
    )
    ex.status = "running"
    ex.finished_at = None
    ex.duration_sec = None
    _persist(ex)
    _start_thread(
        exec_id, wf_version, ex.params, ex.task_params, start_stage=stage_index
    )
    return ex


# ---------------------------------------------------------------------------
# Crash recovery (SPEC §6 / §7)
# ---------------------------------------------------------------------------
def _append_system_log(exec_id: str, log_id: str, msg: str) -> None:
    """Append one ``system`` line to a step's log (write_log only persists the
    line bodies; the LogDoc metadata is ignored, so dummy fields are fine)."""
    lines = storage.read_log_lines(exec_id, log_id) or []
    lines.append(LogLine(ts=now_iso(), stream="system", msg=msg))
    storage.write_log(LogDoc(
        id=log_id, execution_id=exec_id, stage_index=0, task_id="",
        attempt=0, step_name="", status="failed", lines=lines,
    ))


def _finalize_orphan(ex: Execution) -> None:
    """Force one mid-flight run into a terminal ``interrupted`` state, cascading
    to its in-flight stages/tasks/attempts/steps. The open attempt/step become
    ``failed`` (those Literals have no ``interrupted``); never-started ``queued``
    nodes become ``cancelled``."""
    for stage in ex.stages:
        if stage.status == "running":
            stage.status = "interrupted"
        elif stage.status == "queued":
            stage.status = "cancelled"
        for task in stage.tasks:
            if task.status == "running":
                task.status = "interrupted"
                for att in task.attempts:
                    if att.status != "running":
                        continue
                    att.status = "failed"
                    if att.finished_at is None:
                        att.finished_at = now_iso()
                        try:
                            att.duration_sec = _dur(
                                datetime.fromisoformat(att.started_at), _now()
                            )
                        except ValueError:
                            pass
                    for step in att.steps:
                        if step.status == "running":
                            step.status = "failed"
                            _append_system_log(
                                ex.id, step.log_id,
                                "Backend stopped — process terminated",
                            )
            elif task.status == "queued":
                task.status = "cancelled"
    ex.status = "interrupted"
    if ex.finished_at is None:
        ex.finished_at = now_iso()
        try:
            ex.duration_sec = _dur(
                datetime.fromisoformat(ex.started_at), _now()
            )
        except ValueError:
            pass


def recover_orphans() -> list[str]:
    """Finalize executions left mid-flight by an abrupt shutdown (SPEC §6).

    A run is owned by an in-process background thread; a freshly started backend
    owns none, so any execution still ``running``/``queued`` on disk at startup is
    orphaned — its process is gone. Such runs can't be resumed (steps already ran
    real side effects in ``$WORKSPACE``), so they are failed-forward to
    ``interrupted`` and the user re-runs manually. Idempotent: a second pass finds
    nothing non-terminal. Returns the ids it finalized."""
    from . import db

    ids = [
        r["id"] for r in db.query(
            "SELECT id FROM executions WHERE status IN ('running', 'queued')"
        )
    ]
    recovered: list[str] = []
    for exec_id in ids:
        ex = storage.read_execution(exec_id)
        if ex is None or ex.status not in ("running", "queued"):
            continue
        _finalize_orphan(ex)
        storage.write_execution(ex)  # re-indexes the new terminal status
        recovered.append(exec_id)
    return recovered
