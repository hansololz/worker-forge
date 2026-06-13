"""Pydantic models for the worker-forge domain (SPEC §4.1-§4.5).

IDs are UUIDv4 strings, versions are monotonic ints from 1, timestamps are
UTC ISO-8601 strings. These models mirror the YAML file shapes; YAML is the
source of truth.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Vocabularies
# ---------------------------------------------------------------------------
Category = Literal["source", "build", "quality", "deploy", "data", "ops"]
Interpreter = Literal["bash", "python", "cmd"]
StepLang = Literal["bash", "python"]
TriggerType = Literal["cron", "manual"]
ExecStatus = Literal[
    "queued", "running", "succeeded", "failed", "cancelled", "interrupted"
]
NodeStatus = Literal[
    "queued", "running", "succeeded", "failed", "cancelled", "skipped",
    "interrupted",
]
StepStatus = Literal["running", "succeeded", "failed", "skipped"]

PARAM_KEY_RE = re.compile(r"^[A-Z_][A-Z0-9_]*$")


def new_id() -> str:
    """Fresh UUIDv4 string."""
    return str(uuid.uuid4())


def now_iso() -> str:
    """Current UTC time as ISO-8601 (seconds precision, ``Z``-less offset)."""
    return datetime.now(timezone.utc).isoformat()


def validate_param_keys(params: dict[str, Any]) -> None:
    """Raise ValueError if any key is not a valid shell env identifier."""
    for key in params:
        if not PARAM_KEY_RE.match(key):
            raise ValueError(f"Invalid param key: {key!r} (must match ^[A-Z_][A-Z0-9_]*$)")


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
class EnvParam(BaseModel):
    key: str
    default: str = ""
    required: bool = False

    @field_validator("key")
    @classmethod
    def _check_key(cls, v: str) -> str:
        if not PARAM_KEY_RE.match(v):
            raise ValueError(f"Invalid env key: {v!r}")
        return v


class Step(BaseModel):
    name: str
    description: str | None = None
    lang: StepLang = "bash"
    code: str = ""


class TaskMeta(BaseModel):
    id: str
    name: str
    description: str | None = None
    icon: str = "box"
    category: Category = "ops"
    latest_version: int = 1
    created_at: str
    updated_at: str


class TaskVersion(BaseModel):
    id: str
    version: int
    name: str
    description: str | None = None
    icon: str = "box"
    category: Category = "ops"
    interpreter: Interpreter = "bash"
    retries: int = 0
    timeout_sec: int | None = None
    env: list[EnvParam] = Field(default_factory=list)
    steps: list[Step] = Field(default_factory=list)
    created_at: str


# ---------------------------------------------------------------------------
# Triggers
# ---------------------------------------------------------------------------
class Trigger(BaseModel):
    id: str
    type: TriggerType
    enabled: bool = True
    cron: str | None = None
    # No stored next_at: triggers live in the immutable version file (SPEC §4.1),
    # so the next fire time is computed live when serving the API, never persisted.


# ---------------------------------------------------------------------------
# Workflows
# ---------------------------------------------------------------------------
class TaskRef(BaseModel):
    task_id: str
    # None means "always run the latest version" — resolved to a concrete
    # version at run time (storage.resolve_task_version), so a new task save is
    # picked up by the next run without re-saving the workflow.
    task_version: int | None = None
    enabled: bool = True
    continue_on_failure: bool = False
    params: dict[str, Any] = Field(default_factory=dict)


class Stage(BaseModel):
    tasks: list[TaskRef] = Field(default_factory=list)


class WorkflowMeta(BaseModel):
    # Metadata never stores triggers — they belong to the versioned definition
    # (WorkflowVersion, SPEC §4.1); there is intentionally no `triggers` field here.
    id: str
    name: str
    description: str | None = None
    latest_version: int = 1
    created_at: str
    updated_at: str


class WorkflowVersion(BaseModel):
    id: str
    version: int
    name: str
    description: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    stages: list[Stage] = Field(default_factory=list)
    # Triggers are part of the pinned, versioned definition (SPEC §4.1). Editing
    # a trigger mints a new version, exactly like editing a stage.
    triggers: list[Trigger] = Field(default_factory=list)
    created_at: str


# ---------------------------------------------------------------------------
# Executions (SPEC §4.3)
# ---------------------------------------------------------------------------
class StepOutcome(BaseModel):
    name: str
    status: StepStatus = "running"
    log_id: str


class Attempt(BaseModel):
    index: int
    status: Literal["running", "succeeded", "failed", "cancelled"] = "running"
    started_at: str
    finished_at: str | None = None
    duration_sec: float | None = None
    timeout_sec: int | None = None
    retries_used: int = 0
    retries_allowed: int = 0
    steps: list[StepOutcome] = Field(default_factory=list)


class TaskOutcome(BaseModel):
    task_id: str
    task_version: int
    name: str
    status: NodeStatus = "queued"
    continued: bool = False
    duration_sec: float | None = None
    continue_on_failure: bool = False
    # The effective params this task ran with (env defaults overlaid by every
    # override layer; see runner._resolve_params). Filled once the task starts.
    params: dict[str, Any] = Field(default_factory=dict)
    # Keys in ``params`` that the task's env doesn't declare — ad-hoc params the
    # user added for this run. Rendered with an "added" badge in the run view.
    added_params: list[str] = Field(default_factory=list)
    attempts: list[Attempt] = Field(default_factory=list)


class StageOutcome(BaseModel):
    index: int
    status: NodeStatus = "queued"
    tasks: list[TaskOutcome] = Field(default_factory=list)


class Execution(BaseModel):
    id: str
    # Names the per-run $WORKSPACE dir (workspaces/<workspace_id>/workspace).
    # A distinct UUID from ``id`` so the workspace dir and execution id can
    # diverge later (e.g. shared/reused workspaces). Minted at build time.
    workspace_id: str
    workflow_id: str
    workflow_version: int
    workflow_name: str
    status: ExecStatus = "queued"
    degraded: bool = False
    trigger: TriggerType = "manual"
    actor: str = "user"
    params: dict[str, Any] = Field(default_factory=dict)
    # Per-slot run params keyed by the task's flattened position (stringified
    # index over the run's enabled tasks, in stage/task order). Slot keying lets
    # the SAME task used in two stages keep independent run-time values. May also
    # carry ad-hoc keys the task doesn't declare. Overrides the flat ``params``.
    task_params: dict[str, dict[str, Any]] = Field(default_factory=dict)
    started_at: str
    finished_at: str | None = None
    duration_sec: float | None = None
    stages: list[StageOutcome] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Logs (SPEC §4.5)
# ---------------------------------------------------------------------------
class LogLine(BaseModel):
    ts: str
    stream: Literal["stdout", "stderr", "system"]
    msg: str


class LogDoc(BaseModel):
    id: str
    execution_id: str
    stage_index: int
    task_id: str
    attempt: int
    step_name: str
    status: StepStatus = "running"
    lines: list[LogLine] = Field(default_factory=list)
