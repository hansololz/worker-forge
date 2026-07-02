# worker-forge — Spec

Source of truth. Holds enough detail to rebuild the app from scratch.

---

## 1. Overview

worker-forge is a **desktop workflow orchestrator** — a dark, technical internal tool for defining,
scheduling, running, and monitoring multi-stage automation workflows. It runs as a native desktop
app. **Target platforms: macOS, Windows, Linux. Focus is macOS for now**; the other platforms are
out of scope until macOS is solid, but no decision should hard-block them.

Core model:

- A **Workflow** is an ordered list of **stages**.
- A **stage** runs one or more **Tasks**. Tasks within a stage run **in parallel**; stages run
  **sequentially**. The run advances to the next stage only once every task in the current stage
  has finished.
- A **Task** is a reusable definition (one or more shell/python **steps**, env params, retries,
  timeout). Tasks are shared across workflows.
- A **Trigger** attaches a schedule (cron) or manual launch to a workflow.
- An **Execution** is one run of a workflow. It records per-task attempts and per-step **Logs**.

The product surface is a single-page app with a left nav and these top-level views: **Workflows**,
**Tasks**, **Executions**, **Settings**. (There is **no** standalone "Scheduled" overview page —
cron-scheduled workflows are surfaced via the **All / Scheduled** filter on the Workflows list, and
triggers are edited per-workflow in the workflow editor's Triggers tab.)

Canonical terms used throughout this spec and the UI: **Workflow, Task, Trigger, Execution, Log**.

---

## 2. Architecture

Three-process desktop app:

- **Shell** — Electron main process. Owns the native window, the OS directory picker, launch-on-boot,
  background running, and spawns/supervises the local backend. The window is frameless-inset
  (`titleBarStyle: 'hiddenInset'`) so the dark app fills the entire window with no native title bar;
  the macOS traffic lights overlay the top-left of the sidebar (`trafficLightPosition` ≈ `{x:18,y:19}`,
  sidebar brand padded down ~56px so the wordmark sits below the close/min/max buttons). The window background matches `--bg-0` to avoid a launch
  flash. With no title bar, the sidebar brand row and the empty topbar act as window-drag regions
  (`-webkit-app-region: drag`), with interactive children opting back out (`no-drag`). Renderer origin
  is a random localhost port (CORS is open to `*` on the backend, which only listens on loopback).
  On launch the Shell shows a **branded splash window** the instant the app starts, so the user never
  faces a bouncing dock icon while the backend boots. Startup order: `whenReady` → create the splash
  (a 460×300 frameless, transparent, always-on-top window, painted from an inlined `data:` URL with no
  bundler/file-copy dependency — a rounded `--accent` square with the `hammer` glyph + "Worker Forge"
  wordmark, an indeterminate progress bar, and "Starting workspace…", all on `--bg-0`) → spawn and
  await the backend health check (§ backend boot) → create the main window with `show: false`. The
  splash stays up across **both** startup gaps (backend boot, then the renderer's first `loadAll()`).
  The renderer signals completion via a `window.backend.appReady()` IPC (`app:ready`) fired when its
  initial load settles (success **or** error); the Shell then reveals the main window and closes the
  splash in one swap (no white flash — the main window background is `--bg-0`). A 15s safety timeout in
  the Shell reveals the window regardless, so a renderer crash can never strand the user on the splash.
- **Backend** — a local HTTP API (Python / FastAPI in the reference implementation) bound to
  `127.0.0.1`. Owns the filesystem data directory, the SQLite index, the scheduler, and the task runner.
  Files are the source of truth (§4); the DB is a rebuildable index (§5).
- **Renderer** — React single-page app. Talks to the backend over HTTP. High-fidelity dark UI (see §8)
  built from real ES-module components, a hand-rolled router, and live data fetching.

The stack above is the reference implementation. What is **normative** is the data model, storage
layout, API surface, and behavior described below — not the specific frameworks.

---

## 3. Identifiers & conventions

- **All IDs are UUIDs** (v4). This applies to workflows, tasks, triggers, executions, and logs.
- Versions are **monotonic integers** starting at `1`, per workflow and per task.
- Timestamps are stored in **UTC, ISO-8601**. All absolute date+time stamps render in one
  **canonical format**: `YYYY-MM-DD HH:MM:SS` — numeric, zero-padded, year→seconds order
  (e.g. `2026-06-16 09:14:09`), via `fmtStamp(iso, opts)` in `src/model.js` (`opts.seconds === false`
  drops `:SS`).
- **Every absolute timestamp renders in the user's display timezone**, not UTC — `fmtStamp` (and the
  per-log-line `HH:MM:SS` clock in `src/views/runs.jsx`) shift each instant through `tzDate` so its
  `getUTC*` fields read as local wall-clock. This covers the executions list "Started" column,
  execution-detail run/attempt start & end and step-log line stamps, the workflows-list Scheduled
  column, and the triggers-editor next-run preview. So the rendered local times are unambiguous, a
  short **DST-aware zone tag** (`tzShort(iso)` → `PDT`, `GMT+5:45`, `UTC`, …) is appended to each lone
  timestamp (run-detail Started/Finished/Start/End cells, the triggers "Next run · … · <tz>" preview).
  Dense-table timestamp column headers stay bare (`Started`, `Scheduled`) — no zone tag.
- On the **Workflows list**, the **Last run** column shows the relative age (`fmtAgeIso` → `2h ago`)
  as the primary line and the canonical (display-zone) stamp (`fmtStamp + tzShort`, exposed as
  `lastRunAt`) as the secondary line; workflows that never ran show `—` and no secondary line.
- On the **Workflows list**, the Scheduled column shows a **live countdown** to the next fire as the
  primary line and the canonical (display-zone) stamp as the secondary line: `fmtCountdown(nextAt, now)` renders
  `in <Xd Yh Zm>` at **minute granularity** (no seconds; once a higher unit appears every lower one follows;
  sub-minute → `in <1m`; past/now → `now`), driven by a single shared `useNow` tick that re-renders once a second only when at least one
  visible workflow is cron-scheduled. `scheduleFromTriggers` exposes the raw `nextAt` (epoch/ISO
  `next_at`) alongside the formatted `next` for this. The cron expression is not shown in this cell.
- The **triggers editor** previews the next run for the cron being edited *client-side* via
  `nextCronRun(cron, fromSec)` in `src/model.js` (brute-forced minute-by-minute in UTC; standard cron
  semantics incl. `*/step`, ranges, lists, and the day-of-month/day-of-week OR rule), since the edited
  cron has no backend `next_at` yet. The resulting instant is rendered in the display zone like every
  other stamp.
- The **display timezone** governs every absolute timestamp render. The user picks it in Settings →
  General (§8.8 / settings `timezone`) as a real **IANA zone name** (`America/Los_Angeles`,
  `Europe/London`, `Asia/Kolkata`, `UTC`, …); the wall-clock offset is computed **for each timestamp's
  own instant** via `Intl.DateTimeFormat` (`tzOffsetMin`/`tzDate`), so daylight saving is correct
  worldwide (London BST in summer, LA PDT, southern-hemisphere reversal, half-hour/45-minute zones
  `Asia/Kolkata` +05:30 / `Asia/Kathmandu` +05:45 / `Pacific/Chatham` +12:45). When the setting is
  **unset/empty**, `tzZone` (frontend) falls back to the **machine's current zone**
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — and the backend likewise auto-detects the
  machine IANA zone — so timestamps default to local time, never UTC, unless the user explicitly
  chooses UTC. Changing the timezone re-renders immediately (patch merged into the shared store,
  bumping the render revision).
- Relative ages (`Nm ago`), countdowns (`in …`), and durations are zone-independent and unchanged.
  Cron triggers are evaluated by the backend scheduler in **UTC** (croniter on UTC); only the resulting
  `next_at` instant is surfaced, then formatted in the display zone like any other stamp.
- Status vocabulary (canonical): `queued`, `running`, `succeeded`, `failed`, `cancelled`, `skipped`,
  `interrupted`.
  A run (or node) that has not started yet is `queued`. A run that succeeded overall but tolerated a failed/skipped
  task is **degraded** (`succeeded` + `degraded` flag). Degraded runs render two badges side by side — the base
  `succeeded` status badge plus a separate orange `continued` badge — not a single recolored badge.
  `interrupted` is the terminal state for a run (and its in-flight stage/task) that an abrupt backend
  shutdown left mid-flight; it is distinct from `failed` (a task exited non-zero) and `cancelled` (the
  user stopped it). See crash recovery in §7.

---

## 4. Storage layout (files are source of truth)

Everything lives under a single **data directory** chosen by the user (default
`~/Library/Application Support/Worker Forge/` on macOS; overridable via the Settings → Data Directory
picker, or the `WORKER_FORGE_HOME` env var). Full entity data is stored in **YAML files**. The DB
(§5) holds only lightweight index rows — just enough to list, filter, and look up without scanning.

```
data/
    agent.db                         # SQLite index (rebuildable from the YAML below)
    workflows/
        <workflow_id>/
            metadata.yaml            # light: name, desc, latest_version, timestamps
            versions/
                <version_number>.yaml  # full pinned definition for that version
    tasks/
        <task_id>/
            metadata.yaml            # light: name, desc, icon, category, latest_version, timestamps
            versions/
                <version_number>.yaml  # full pinned definition for that version
    executions/
        <execution_id>/
            execution.yaml           # run summary + per-task/attempt outcome
            logs/
                <log_id>.txt         # one plain-text log file per step attempt
    workspaces/                      # one directory per execution
        <workspace_id>/              # Execution.workspace_id (own UUID, not the execution id)
            workspace/               # that run's $WORKSPACE (shared by all its steps)
```

Triggers are small and belong to a workflow; they are stored inside the workflow's **version file**
(`versions/<n>.yaml`, a `triggers:` list) as part of the pinned definition (§4.1), rather than in
their own directory tree. They are **not** indexed in the DB (§5) — the scheduler and the list
endpoints read them straight from each workflow's latest version YAML. They remain a first-class API
resource (§6), but every trigger mutation mints a new workflow version.

**App config is stored separately from the data directory** — in the per-user OS config directory, NOT
inside the data-directory folder. Rationale: (1) the data-directory *path itself* is a setting, so config
must be read before the data-directory location is known (chicken-and-egg); (2) config is machine/user-scoped
(window state, launch-on-boot, timezone) while the data directory is portable project data that can be
synced or shared. Locations: macOS `~/Library/Application Support/Worker Forge/config.json`,
Linux `$XDG_CONFIG_HOME/worker-forge/config.json`, Windows `%APPDATA%\Worker Forge\config.json`. Config
holds the data-directory pointer (config key `data_directory`) + app preferences. Pointing the data
directory at a synced/version-controlled folder is the intended way to share it across machines.

**Execution history can optionally live outside the data directory.** Two config keys control this:
`executions_separate` (bool, default off) and `executions_path` (a *root* directory that holds the
`executions/` subfolder). When the override is off, executions live at `<data-directory>/executions` as
shown above. When on, they live at `<executions_path>/executions`. This lets a large or fast-growing
run history be kept off a synced data-directory folder. `executions_path` defaults to the data directory
and is only honored when `executions_separate` is on. Changing the location does **not** migrate existing
run history — old execution YAMLs stay at the previous root and drop out of the index (§5) on the
next reconcile until the path points back at them.

**Each execution gets its own `$WORKSPACE` directory.** Every execution carries a `workspace_id` — a
fresh UUID minted at build time, **distinct from the execution id** and stored in `execution.yaml` —
that names its workspace dir. At run start the engine creates `<root>/workspaces/<workspace_id>/workspace`
and sets `$WORKSPACE` to it. Keeping the two ids separate lets the workspace dir and execution diverge
later (e.g. a future shared/reused workspace) without a schema change. This single directory is
**shared by every stage, task, attempt, and step of that run** (checkout-once, CI-style — note that
parallel tasks in a stage therefore share it). It is **kept after the run finishes** (not cleaned up)
so the working tree can be inspected; per-execution dirs accumulate under `workspaces/`. Retry-from-failure
reuses the same directory (the mkdir is idempotent); rerun mints a new execution, hence a new workspace_id.

The `workspaces/` parent can optionally live outside the data directory. Two config keys control this:
`workspace_separate` (bool, default off) and `workspace_path` (a *root* directory that holds the
`workspaces/` subfolder). When off, runs live under `<data-directory>/workspaces`; when on, under
`<workspace_path>/workspaces`. `$WORKSPACE` working trees are temporary, can grow large, and are best
kept on fast local disk off a synced folder. `workspace_path` defaults to the data directory and is only
honored when `workspace_separate` is on. Changing the location only affects new runs — existing per-run
dirs are not migrated.

### 4.1 Workflow YAML

`metadata.yaml` (light):

```
id: <uuid>
name: <string>                 # slug-like, unique within data directory
description: <string|null>
latest_version: <int>
created_at: <iso8601>
updated_at: <iso8601>
```

`versions/<n>.yaml` (full pinned definition):

```
id: <uuid>
version: <int>
name: <string>
description: <string|null>
params: { <KEY>: <value>, ... }   # workflow-level params (defaults for the run)
stages:                           # ordered; each entry is one stage (a parallel group)
  - tasks:
      - task_id: <uuid>
        task_version: <int|null>  # pinned task version; null = always latest (resolved per run)
        enabled: <bool>           # default true
        continue_on_failure: <bool>  # default false; if true a failure does not abort the run
        params: { <KEY>: <value> }   # per-ref param overrides for this task in this workflow
triggers:                         # see §4.4 — part of the pinned definition
  - <trigger>
created_at: <iso8601>
```

Editing a workflow writes a **new version file** and bumps `latest_version`; prior versions are
immutable history (drives the version picker and the editor's amber "version" banner). **Triggers
are part of this versioned definition** — adding, editing, enabling/disabling, or removing a trigger
mints a new version exactly like a stage edit, so a workflow's schedule is pinned, auditable, and
rolls back with the rest of the definition. The scheduler fires the **latest version's** triggers.

### 4.2 Task YAML

`metadata.yaml` (light):

```
id: <uuid>
name: <string>
description: <string|null>
icon: <string>                 # glyph key, see §8
category: source|build|quality|deploy|data|ops
latest_version: <int>
created_at: <iso8601>
updated_at: <iso8601>
```

`versions/<n>.yaml` (full):

```
id: <uuid>
version: <int>
name: <string>
description: <string|null>
icon: <string>
category: source|build|quality|deploy|data|ops
interpreter: bash|python|cmd   # default bash
retries: <int>                 # auto-retry count on failure; default 0
timeout_sec: <int|null>        # null = no timeout
env:                           # parameters / environment for the task
  - key: <ENV_KEY>             # validated (see §6.4)
    default: <string>
    required: <bool>           # default false
steps:                         # ordered; run sequentially within the task
  - name: <string>             # e.g. clone.sh
    description: <string|null>
    lang: bash|python          # default bash
    code: <string>             # script body
created_at: <iso8601>
```

### 4.3 Execution YAML

`execution.yaml`:

```
id: <uuid>
workflow_id: <uuid>
workflow_version: <int>        # pinned at launch
workflow_name: <string>        # denormalized for display
status: queued|running|succeeded|failed|cancelled|interrupted
degraded: <bool>               # succeeded overall but tolerated a failed/skipped task
trigger: cron|manual           # how it was launched
actor: <string>                # user (manual/API) or "scheduler" (cron)
params: { <KEY>: <value> }     # resolved run params
started_at: <iso8601>
finished_at: <iso8601|null>
duration_sec: <number|null>
stages:                        # snapshot of the run graph + outcomes
  - index: <int>
    status: queued|running|succeeded|failed|cancelled|skipped|interrupted
    tasks:
      - task_id: <uuid>
        task_version: <int>
        name: <string>
        status: queued|running|succeeded|failed|cancelled|skipped|interrupted
        continued: <bool>      # a failed task tolerated via continue_on_failure
        duration_sec: <number|null>
        attempts:              # always >= 1
          - index: <int>       # 1-based
            status: running|succeeded|failed|cancelled
            started_at: <iso8601>
            finished_at: <iso8601|null>
            duration_sec: <number|null>
            timeout_sec: <int|null>
            retries_used: <int>
            retries_allowed: <int>
            steps:             # per-step outcome; full lines live in logs/<log_id>.txt
              - name: <string>
                status: running|succeeded|failed|skipped
                log_id: <uuid>
```

### 4.4 Trigger (embedded in the workflow `versions/<n>.yaml`)

```
id: <uuid>                     # stable across versions; carried forward on edits
type: cron|manual
enabled: <bool>                # default true
cron: <string|null>            # 5-field cron expr when type=cron, else null
```

A trigger carries **no stored `next_at`**: the version file is immutable, so the next fire time is
**computed live** (croniter, in UTC) whenever the API serves a trigger — never persisted. The
scheduler keeps its own in-memory next-fire cache for firing. A trigger's `id` is stable across
versions: editing a trigger mints a new version that carries the same `id` forward with the changed
fields, so history and the API stay consistent. Because the `id` is stable, the scheduler caches the
next fire time **keyed by `(trigger_id, cron)`** — if a newer version changes the trigger's cron the
cache entry is recomputed at the next tick, so the schedule always reflects the **latest version**
and never keeps firing on a superseded version's cron.

**`metadata.yaml` never stores triggers.** `WorkflowMeta` has no `triggers` field; triggers live only
in the version file (§4.1), so the scheduler reads them from there and never from metadata.

### 4.5 Log file

`logs/<log_id>.txt` — one plain-text file per step attempt. No metadata is stored in the file;
the step→log mapping and step status live in `execution.yaml` (`StepOutcome.log_id` / `status`).

One log line per text line, tab-separated:

```
<iso8601_ts>\t<stream>\t<msg>
```

- `ts` — iso8601, rendered HH:MM:SS in the terminal.
- `stream` — `stdout` | `stderr` | `system` (drives line styling).
- `msg` — the line body; may contain tabs (only the first two tabs are delimiters).

`GET /api/executions/{id}/logs/{log_id}` parses this file and returns `{ "lines": [{ts,stream,msg}] }`.

---

## 5. Index database (`agent.db`)

SQLite. **Rebuildable** from the YAML files — it is a cache/index for fast list, filter, and lookup,
never the source of truth. On startup the backend ensures the schema and may reconcile the index by
scanning the data directory. Rows are intentionally lightweight; full payloads stay in YAML.

The index is kept in sync **automatically by the storage layer**: every workflow/task/execution
write or delete updates the corresponding index row as part of the same call, so route handlers and
the runner never index by hand. `reconcile()` (startup, or after a data-directory / executions-path
change) rebuilds the whole index from the YAML.

Tables (workflows, tasks, executions). **Triggers are not indexed** — they live in each workflow's
latest version file (§4.1/§4.4) and are read from there by the scheduler and the list endpoints;
there is no `triggers` table.
Logs are **not** indexed either — the
step→log mapping lives in each execution's YAML (`StepOutcome.log_id`) and log line bodies live in
the per-execution log directory (§4). To serve a log the backend reads the execution YAML for the
`log_id` and loads `executions/<exec_id>/logs/<log_id>.txt` from that directory.

**`workflows`** — id only. Nothing references this table by FK, so it is optional and could be dropped
entirely; it is kept as a cheap id/count index. All display
fields (name, description, latest_version, created_at, updated_at) live in the
workflow's YAML meta and are read from there, never duplicated here.

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |

The workflow list endpoint enumerates ids (filesystem / this table) and reads each workflow's YAML meta
for its fields — it already reads that meta for stage/task counts, so no extra I/O. Ordering (by name)
is done in app code. Name-uniqueness is enforced at the app level by scanning metas on create, not by a
DB `UNIQUE` constraint.

**`tasks`** — id only. Nothing references this table by FK, so it is
optional and could be dropped entirely; it is kept as a cheap id/count index. All display fields (name,
description, icon, category, latest_version, created_at, updated_at) live in the task's YAML meta and
are read from there, never duplicated here.

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |

The task list endpoint enumerates ids and reads each task's YAML meta for its fields and ordering (by
name) in app code. Unlike the workflow list, this adds one meta read per task (the old list served
entirely from index columns) — negligible at desktop scale. Tasks have no name-uniqueness constraint.

There is **no `triggers` table.** A workflow's triggers (§4.1/§4.4) are read from its latest version
file: the scheduler scans each workflow's latest version each tick for enabled cron triggers, and the
workflow-list / trigger endpoints read the same `triggers:` list. `next_at` is **computed live**
(croniter) when serving the API and held in the scheduler's in-memory cache for firing — never
written to YAML or DB (the version file is immutable). Cost is one version read per workflow per scan
— negligible at desktop scale, and it keeps the YAML the single source with no index to keep in sync.
Deleting a workflow removes its triggers with its directory; no FK cascade is needed (the old
`triggers.workflow_id` FK is gone).

**`executions`**

| column | type | notes |
|---|---|---|
| id | TEXT PK | UUID |
| workflow_id | TEXT | **No FK** — executions are denormalized and outlive their workflow so run history is retained when the workflow is deleted (§8.3). |
| workflow_version | INTEGER | pinned at launch |
| workflow_name | TEXT | denormalized (list never joins `workflows`) |
| status | TEXT | queued/running/succeeded/failed/cancelled/interrupted |
| degraded | INTEGER | bool |
| trigger | TEXT | cron \| manual |
| actor | TEXT | user or "scheduler" |
| started_at | TEXT | iso8601, indexed (list is newest-first) |
| finished_at | TEXT NULL | |
| duration_sec | REAL NULL | |

No `logs` table exists. Each step in an execution's YAML carries its own `log_id`, and the log
document lives at `executions/<exec_id>/logs/<log_id>.txt` (§4) — so log lookup needs no index.

Foreign keys are enforced (`PRAGMA foreign_keys=ON` per connection).

---

## 6. API endpoints

Local HTTP, all under `/api`, JSON. The backend listens on loopback only. The execution list reads
the index (the only table that keeps query columns); the workflow, task, and trigger lists derive
their fields from each item's YAML meta. Detail/version endpoints read the YAML. Mutations write YAML
first, then update the index.

### 6.1 Health

- `GET /api/health` → `{ "status": "ok" }`

### 6.2 Workflows

- `GET /api/workflows` — list (index rows: id, name, description, latest_version, last execution
  status/time, stage/task counts, schedule summary). Supports `?search=` and an `All|Scheduled`
  filter.
- `POST /api/workflows` — create `{ name, description?, params?, stages?, triggers? }`. Seeds
  **version 1 with the supplied definition**, so a brand-new workflow's first saved definition is
  version 1 (not an empty v1 shell plus a v2 holding the content). The body is optional beyond `name`;
  omitting the definition fields creates an empty version 1. New triggers may carry a client-temp
  `t_*` id, replaced server-side with a real id. The editor's "Create workflow" sends the full draft
  here in one call (no follow-up version save), so the very first version is 1; later edits go to
  2, 3, ….
- `GET /api/workflows/{id}` — meta + list of available versions.
- `GET /api/workflows/{id}/versions/{n}` — full pinned definition (stages → task refs).
- `POST /api/workflows/{id}/versions` — save an edit: full new definition body (`name`,
  `description?`, `params`, `stages`, and an **optional `triggers` list**) → creates version
  `latest_version + 1`, bumps meta. Returns the new version. The body captures stages, params **and**
  triggers together, so one editor save mints **exactly one** version. New triggers may carry a
  client-temp `t_*` id, which the server replaces with a real id; existing ids are preserved. Omitting
  the `triggers` field entirely carries the prior version's triggers forward unchanged (so a
  stages-only save does not drop the schedule).
- `DELETE /api/workflows/{id}` — remove workflow (removes the workflow directory, which takes its
  embedded triggers with it; drops the id row from the index). Executions are retained (§8.3): their
  YAML and index rows survive.

### 6.3 Triggers (scheduled)

Triggers are part of the versioned definition (§4.1), so **every create/patch/delete mints a new
workflow version** (it reads the latest version, applies the change to its trigger list, and writes
`latest_version + 1`). Reads return the trigger with a live-computed `next_at` (cron only). The
workflow detail (`GET /api/workflows/{id}`) and version (`.../versions/{n}`) responses also include
the `triggers` list with live `next_at`.

- `GET /api/workflows/{id}/triggers` — list the latest version's triggers (each with live `next_at`).
- `POST /api/workflows/{id}/triggers` — create `{ type, cron?, enabled? }` → mints a new version.
- `PATCH /api/triggers/{trigger_id}` — update cron / enable / disable → mints a new version.
- `DELETE /api/triggers/{trigger_id}` — remove → mints a new version.
- (Optional convenience) `GET /api/triggers` — all triggers across workflows; not consumed by the UI.

These per-trigger endpoints remain a first-class API resource, but **the UI does not call them**.
Both the workflow editor's Save *and* the per-workflow Triggers editor (the `schedule` view) save
triggers by folding the full trigger list into the single `POST /workflows/{id}/versions` body
(above), so any trigger edit — alone or alongside stage/param changes — mints exactly **one** version.
The client method layer (`api.js`) omits the per-trigger wrappers; the endpoints stay for API
completeness and external callers.

### 6.4 Tasks

- `GET /api/tasks` — library list (index rows: id, name, description, icon, category, latest_version,
  used-by count).
- `POST /api/tasks` — create `{ name, description?, icon?, category?, interpreter?, retries?,
  timeout_sec?, env?, steps? }`. Seeds version 1.
- `GET /api/tasks/{id}` — meta + available versions.
- `GET /api/tasks/{id}/versions/{n}` — full pinned definition (steps, env, retries, timeout).
- `POST /api/tasks/{id}/versions` — save an edit → new version, bump meta.
- `DELETE /api/tasks/{id}` — remove (reject or warn if still referenced by a workflow version).

**Param-key validation** is enforced identically at the API and storage layers: env/param keys must
be valid shell environment identifiers (e.g. `^[A-Z_][A-Z0-9_]*$`). Invalid keys are rejected on
write.

### 6.5 Executions

- `GET /api/executions` — all runs newest-first. `?status=all|succeeded|failed`, `?workflow_id=`,
  pagination (`?page=`, 50/page). Returns index rows (workflow name, run UUID, status, trigger,
  actor, duration, started).
- `POST /api/executions` — launch a run `{ workflow_id, workflow_version?, params?, task_params? }`.
  `params` is flat `{KEY: value}` global run params applied to every task; `task_params` is
  `{slotIdx: {KEY: value}}` per-slot overrides that win over the global layer, keyed by the task's
  **flattened index over the run's enabled tasks** (stage by stage, task by task — the same order as
  the run view). Slot keying lets the *same* task used in two stages keep independent run-time values
  (env vars are isolated per task occurrence — never flattened to one global value). A `task_params`
  slot may also carry **ad-hoc keys the task's env doesn't declare** ("added" params for that run).
  Validates required params; creates a `running` (or `queued`) execution and returns its id (UI
  navigates to the execution view). Cron triggers post here with `actor = "scheduler"` and no params.
- `GET /api/executions/{id}` — full run detail (summary + stage/task rail + attempts). Also
  returns `workspace_dir`: the absolute `$WORKSPACE` path for the run
  (`<workspace_root>/workspaces/<workspace_id>/workspace`), computed server-side since the renderer
  does not know the root — the run page's **Workspace** button reveals it in the OS file manager (§8.7).
- `GET /api/executions/{id}/logs/{log_id}` — one step-attempt log document (lines).
- `POST /api/executions/{id}/cancel` — cancel a running execution.
- `POST /api/executions/{id}/rerun` — launch a fresh execution from the same workflow version, reusing
  both the prior run's flat `params` and per-slot `task_params`.
- `POST /api/executions/{id}/retry-from-failure` — **run-level aggregate retry**: re-run from the stop
  stage of a `failed`/`cancelled` run, retrying every stuck (failed/cancelled) task in place and
  resuming the run to completion; already-succeeded tasks are left untouched. See §7.
- `POST /api/executions/{id}/skip-failed` — **run-level aggregate skip**: skip every failed task and
  finish all remaining stages of a `failed`/`cancelled` run, completing it as `succeeded` + `degraded`
  (continued); see behavior in §7.
- **Task-scoped controls** — act on a single task addressed positionally by `{stage}`/`{task}` index
  (a task has no unique id within a stage):
  - `POST /api/executions/{id}/tasks/{stage}/{task}/cancel` — stop one `running`/`queued` task on a
    live run via its own cancel flag; the rest of the run carries on and the run is left `degraded`.
  - `POST /api/executions/{id}/tasks/{stage}/{task}/skip` — mark the task `skipped`. On a terminal
    (`failed`/`cancelled`) run, if it clears the stage's last blocker the stage finishes and the run
    resumes from the next stage, else the run stays terminal. **Live** (run still `running` and the
    task's stage still `running`): a failed/cancelled task is skipped in place without disturbing its
    still-running siblings — the run loop applies it and the stage no longer fails on that task. See §7.
  - `POST /api/executions/{id}/tasks/{stage}/{task}/retry` — re-run that task. On a terminal run, reset
    the task and all later stages to `queued` and resume the run from the task's stage. **Live** (run +
    stage both still `running`): re-run just this failed/cancelled task in place; siblings keep running
    and later stages are untouched (they never started). See §7.

### 6.6 Settings / data directory

- `GET /api/settings` — config (`data_directory` path, timezone, launch-on-startup, keep-running-in-background,
  `executions_separate` + `executions_path`, `workspace_separate` + `workspace_path`) plus data-directory
  summary counts (N workflows · N tasks ·
  N executions). `launch_on_startup` and
  `keep_running_in_background` both default to **on** when unset. `executions_separate` and
  `workspace_separate` default to
  **off**; `executions_path` and `workspace_path` default to the data-directory path (§4). When `timezone` is unset, the
  backend detects the machine's **IANA zone** (`_detect_iana_timezone`: the `TZ` env var if it names
  a valid zone, else the `/etc/localtime` symlink target on macOS/Linux), falling back to `UTC` if
  detection fails. A set `timezone` is passed through `normalize_timezone` (validates the IANA name
  via `zoneinfo`, falling back to `UTC` for anything unrecognized).
- `PATCH /api/settings` — update preferences. An incoming `timezone` is run through the same
  `normalize_timezone`, so the stored value is always a valid IANA name (unknown values become `UTC`). The Settings → General picker lists the full IANA set
  (`Intl.supportedValuesOf('timeZone')`) with a searchable dropdown, each option labeled with its
  current DST-aware offset (e.g. `Europe/London · UTC+01:00`).
  `PATCH` also accepts `executions_separate` and `workspace_separate` (bool). Toggling `executions_separate`
  on seeds `executions_path` from the
  data directory if unset; either toggle re-creates the effective executions dir and reconciles the index
  (§5) against the new root. Toggling `workspace_separate` likewise seeds `workspace_path` and re-creates
  the effective `workspaces/` dir (no index — per-run dirs are kept, not migrated, §4).
- `POST /api/settings/data-directory` — change the data directory (the Electron shell opens the OS
  native directory picker; backend re-points and re-indexes).
- `POST /api/settings/executions` — set a custom execution-history root `{ path }` (OS directory
  picker). Creates the directory, sets `executions_path`, turns `executions_separate` on, and
  reconciles the index. Existing history is not migrated (§4).
- `POST /api/settings/workspace` — set a custom `workspaces/` root `{ path }` (OS directory picker).
  Creates the directory, sets `workspace_path`, and turns `workspace_separate` on. No reindex —
  per-run dirs are kept, not migrated (§4).

---

## 7. Runner & scheduler behavior

- **Execution model**: stages run sequentially; within a stage, all enabled tasks run in parallel.
  The run advances only when every task in the current stage has reached a terminal state.
- **Task = sequential steps**: a task's steps run in order under the task's interpreter. A step's
  stdout/stderr/system lines stream into its log document.
- **Param resolution & injection**: each step runs with a fresh env = parent process env, then the
  task's resolved params overlaid, then `DATA_DIRECTORY` defaulted to the attempt's temp workdir. Same env
  for bash and python. Resolution merges last-write-wins: `task env defaults <- workflow params <-
  per-ref params <- global run params <- per-slot run params`, coerced to strings. Env vars are
  **isolated per task occurrence**: per-ref params are scoped to that task **ref instance** (two refs
  to the same task version keep distinct values, never collapsed by task id+version), and run params
  carry a per-slot layer (`task_params[slotIdx]`, keyed by the task's flattened index over the run's
  enabled tasks) so the same task in two stages keeps distinct values. The resolved param set the task
  ran with is stored on its `TaskOutcome.params`, with any keys the task's env doesn't declare listed
  in `TaskOutcome.added_params` (rendered as "added" in the run view). Both flat `params` and
  `task_params` are stored on the execution for faithful re-run / retry.
- **Retries**: on task failure the runner auto-retries up to the task's `retries` count. Each try is
  a new **attempt** (1-based). The Info tab shows `retries_used / retries_allowed` for the inspected
  attempt; `none` when no retries are configured. **Attempts are append-only history**: a manual
  retry (per-task, run-level, or live) **preserves the task's prior attempts** and numbers its new
  attempts after them — so the failed attempt that prompted the retry stays visible in the attempt
  tabs. `retries_used` resets per manual retry (it counts only that run's auto-retries). Downstream
  stages that are reset to re-run from scratch start with a fresh attempt list.
- **Live status**: when a stage starts, the runner marks the stage and all its runnable tasks
  `running` and persists **before** executing them. While the stage runs, the run loop re-persists
  **whenever the stage's progress changes** — a task finishing, but also an **attempt or step
  starting** — so an in-flight (`running`) attempt and its live step states surface within one poll
  interval rather than appearing only once the task is done (this is what makes a manual **retry's new
  attempt show up immediately, while it runs**). Change is detected by a cheap per-stage signature
  (task statuses + each attempt's status + its steps' statuses), so the file is rewritten only on a
  real transition, not on every poll tick. All persistence stays on the parent run-loop thread (the
  sole writer of `execution.yaml`), so concurrent task threads never race on the file. Step-level
  output still streams live to per-step log files (§4.5) as it is produced. On the run page, the task
  panel auto-selects the newest attempt the moment it appears, so a live retry is visible without a
  manual tab switch.
- **continue_on_failure**: if a task ref has this set, its failure does not abort the run; the task
  is marked failed/`continued` and the run proceeds, finishing **degraded**.
- **Abort**: a failed task without `continue_on_failure` fails its stage and the run is `failed`. The
  run is terminated, so its remaining/later tasks never run — at finalize they are marked **`cancelled`**
  (not left `queued`): `queued`/`running` are transient states and must never be a final per-task status
  on a completed run. This mirrors a whole-run cancel, which likewise cancels every unstarted task.
- **Cancellation (immediate kill)**: cancelling a run or a single task does not merely set a flag for
  each step's poll loop to notice later — it **immediately SIGKILLs the live step processes** as part
  of the cancel call. Each step subprocess is launched in its **own process group** (`start_new_session`),
  and the runner keeps a registry of live step processes keyed by `"<exec>:<stage>:<task>"`. Run cancel
  kills every process whose key is prefixed by the exec id; task cancel kills only the matching key.
  Killing the process **group** (not just the direct child) reaps any children the step spawned, so no
  work survives the cancel. There is **no grace period on cancel** (SIGKILL outright); the SIGTERM→3s→SIGKILL
  graceful path is reserved for **timeouts**. The step then reports `cancelled` (cancel wins over
  timeout/exit-code reporting), and the run loop marks the run/stage/tasks `cancelled` and persists the
  result. A still-`queued` task is cancelled before it ever spawns.
- **Live per-task recovery (failed task, run still running)**: when a task fails inside a stage whose
  other tasks are still running, the run does **not** have to reach a terminal state before the user can
  act on it. The UI shows `Skip`/`Retry` for that failed task immediately. Because the running execution
  holds its `Execution` in memory (the run thread is the sole writer), these controls do **not** mutate
  disk directly — `skip_task`/`retry_task` enqueue a command onto a per-run queue and the run loop
  applies it on its own thread between task-completion waits: `skip` marks the task `skipped` (run left
  `degraded`) so the stage no longer fails on it; `retry` resets the task to `queued` and resubmits just
  that task to the stage's worker pool. **Neither affects the failed task's siblings** — they keep
  running — and a live retry leaves later stages untouched (they never started). This window lasts only
  while the task's stage is `running`; once the stage settles the run goes terminal and the **terminal**
  per-task / run-level controls below apply (identical effect on the task).
- **Recovery scopes**: a terminal `failed`/`cancelled` run can be recovered at **two scopes** —
  surgical **per-task** (advance stage by stage, below §7) and aggregate **run-level** (the whole run
  at once):
  - **Skip failures** (run-level): mark every failed task across the run `skipped` and finish **all**
    remaining stages — every still-pending (`queued`/`cancelled`) task completes as `succeeded` and the
    run completes as `succeeded` + `degraded` (continued).
  - **Retry** (run-level): retry every stuck (failed/cancelled) task from the stop stage and resume the
    run to completion; already-`succeeded` tasks are never re-run.
- **Scheduler**: on each tick it scans every workflow's **latest version** (§4.1) for enabled cron
  triggers — there is no trigger index (§5) — computes each next fire time in an **in-memory** cache
  (nothing is written back to YAML; the version file is immutable), and at fire time launches an
  execution of the latest version (`trigger=cron`, `actor="scheduler"`). **Only the latest version's
  triggers are ever evaluated** — triggers from older/superseded versions are ignored: a trigger no
  longer present-and-enabled in the latest version is dropped from the cache, and the cache is keyed
  by `(trigger_id, cron)` so a cron changed by a newer version is recomputed rather than firing on the
  stale schedule. Disabled triggers never fire. "Keep running in background" (Settings) governs
  whether the scheduler fires while the window is closed.
  - **Immediate pickup**: the tick is a ~20s poll, but every API mutation that touches triggers —
    creating a workflow, saving a workflow version, and the create/patch/delete trigger routes (§6.3) —
    calls `scheduler.refresh()` synchronously after the write, so a new/changed/removed cron trigger is
    primed into the cache **right away** instead of waiting for the next tick. `refresh()` re-runs the
    same scan as a tick (without firing) and is a no-op when the scheduler thread isn't running. The
    cache is guarded by a lock since the request thread and the scheduler thread now both touch it.
- **Crash recovery (orphaned runs)**: a run is owned by an in-process background thread, so a freshly
  started backend owns none — any execution still `running`/`queued` on disk at startup was orphaned by
  an abrupt shutdown (its process is gone). On startup, **after** `reconcile()` and **before** the
  scheduler starts or the API accepts requests, the backend fails such runs forward: the run → `interrupted`,
  its running stage/task → `interrupted`, the open attempt/step → `failed` (those nodes have no
  `interrupted` value) with a `system` log line "Backend stopped — process terminated", and never-started
  `queued` stages/tasks → `cancelled`. `finished_at`/`duration_sec` are stamped at recovery time (best
  effort; true death time is unknown), never left null. Runs are **not auto-resumed** — already-run steps
  had real `$WORKSPACE` side effects and there is no sub-step checkpoint, so the user re-runs (prefilled
  prepare page) manually. The sweep is idempotent: a second pass finds nothing non-terminal. Workspaces
  are untouched (kept by design, §4).
- **Timestamps**: a run's `started_at`/`finished_at` and each task attempt's start/end are real UTC
  timestamps captured by the runner. Duration is derived.

---

## 8. UI / views

Single-page app, left nav (`--nav-w` 232px sidebar), wordmark "Worker Forge" (the "Forge" in accent).
High-fidelity dark theme.
The 52px topbar holds only breadcrumbs — it is flat and transparent (no bottom border, no glass/blur
backdrop), blending into the page background.

**Nav collapse (Claude-desktop style):** the left rail collapses to free reading width. A 28×28 ghost
icon-button (`.nav-toggle`) rendered with a hand-built "panel-left" SVG glyph (`PanelIcon` — rounded
rect with a vertical divider near the left edge; FA Free has no sidebar icon) toggles it. Color
`--tx-lo`; hover → `background --bg-2`, `color --tx`; always `-webkit-app-region: no-drag`. Two
placements: (1) in the **sidebar brand header**, pinned right (`margin-left: auto`), always
visible; (2) in the **topbar far-left**, shown
**only when collapsed** to reopen the rail — when collapsed the topbar gets `padding-left: 80px` so the
button clears the macOS traffic lights. Mechanics: a `nav-collapsed` class on the `.app` root switches
the grid from `var(--nav-w) 1fr` to `0 1fr`, transitioning `grid-template-columns` over
`.24s cubic-bezier(.4,0,.2,1)` so the rail slides shut/open; the sidebar is `overflow: hidden` and its
brand+nav keep `min-width: var(--nav-w)` so contents **clip** rather than reflow, and the right border
fades to transparent. State persists to `localStorage` key `ad_nav_collapsed` (`"1"`/`"0"`), restored
on load. Button `title`/`aria-label` are "Collapse sidebar" when open, "Expand sidebar" when collapsed.
The `.page` content area is **capped at `max-width: 1120px` and centered** (`margin: 0 auto`) within
the content region, with `26px 30px 80px` padding; `.page-wide` and `.page-narrow` share the same
1120px cap and exist only as semantic class names.
`src/index.css` is the visual source of truth (design tokens in `:root`); every view is a real
ES-module React component fed live API data.

Every page header uses the `.ph` block: a title group on the left, a `.ph-actions` button group on the
right (`margin-left: auto`). `.ph` defaults to **top-aligned** (`align-items: flex-start`) — used by the
list pages and the run/workflow detail pages, so the title (22px/600) and the action buttons sit at the
same height. The **task detail, task editor, workflow editor, and triggers editor** headers override
this with `align-items: center` (inline `style={{ alignItems: 'center' }}` on the `.ph`), so their
single title row (which pairs the title with an inline version picker) sits vertically centred against
the header actions. Detail/editor titles may pair the title with an inline version picker and a
description line below.

Top-level views:

1. **Workflows (list)** — page header + a card of clickable workflow rows: name, description,
   last-status badge, stage count, schedule chip, chevron. `All | Scheduled` segment + search;
   selection is remembered across navigation.
2. **Workflow detail** — header shows the workflow name + mono version picker and three actions in
   order `Run` · `Clone` · primary `Edit` (`Run` opens prepare-run, `Clone` toasts `Cloned <name>`,
   `Edit` opens the editor). Below: a pipeline diagram of stage nodes connected by animated connectors
   (running node glows cyan; active connector animates a flowing gradient), then a recent-executions
   list reusing the shared run row.
3. **Workflow editor / Prepare-run** — tabs `Config | Stages | Triggers`. Stage editor rows, param
   inputs, required toggles, amber version banner. Clicking a task row in **Stages** does **not** open
   the task page — the **whole row** toggles open in place. The row shows the task icon/name, a
   parameter-count meta chip (`.task-meta`, with an override badge) and a chevron that rotates on open,
   plus a red remove (×) button (its click stops propagation so it doesn't toggle the row). Opening a
   row reveals **one combined panel** (`.task-panel`) connected seamlessly below it (shared border, no
   seam) that stacks two sections: **Parameters** (only when the task declares env vars) above
   **Settings**, separated by a top-border divider (`.task-panel-b + .task-panel-h`). Parameter rows
   show key + source chip (`workflow` / `overrides wf`) + required/optional tag + a value input (no
   per-row clear button). **Settings** holds: task-version pin picker (version options label the
   saved-at date before the `· current` tag), continue-on-failure toggle, an editable **Retry count**
   (integer ≥ 0, default 0), and a **Timeout** (enable/disable toggle + integer seconds input, default
   600 s; toggle off = no limit). Retry/timeout overrides persist on the draft's `exec[taskId]` map
   (`{ version, continueOnFailure, retries, timeout }`; `timeout: null` = disabled, `undefined` =
   inherit the task default). The picker's top option is **Latest (auto-update)**:
   it persists `task_version: null`, and each run resolves it to the task's current `latest_version`
   at launch — so saving a new task version is picked up by the next run without re-saving the
   workflow. Picking a concrete version stores that integer and pins it forever (an amber hint warns
   when a newer version exists). Backend `storage.resolve_task_version` does the null→latest resolution
   once at execution-build time, so a single run stays pinned to one deterministic version. The `Config` tab ends (existing workflows only) with
   a **Delete workflow** section: a top-border-divided `field` block with a muted label, a hint
   ("Removes the workflow and its schedule. Run history is retained. This can't be undone."), and a
   danger `Delete workflow` button. Both this button and the workflows-list row context-menu `Delete`
   open the **shared confirmation modal** (§8.x) — they never delete on the spot. **Validation (create
   & edit)**: the primary action (`Create workflow` / `Save changes`) is disabled until the draft is
   valid. Rules surfaced via `.field-err` banners below the header: (1) a non-empty **name** is
   required; (2) the workflow must have **at least one stage**; (3) **every stage must contain at least
   one task**. A stage's delete button is disabled when it is the only stage; an empty stage shows an
   inline `.field-err` prompting the user to add a task. The **Triggers tab is shown while creating**
   (`__new`) too — triggers can be configured up front and are persisted with the new workflow on
   `Create workflow`.
3a. **Run prepare page** (`Run` / `Re-run` → review parameters before launch): header shows
   `Run`/`Re-run` + workflow name + version tag, a subtitle ("Review the parameters for this run,
   grouped by stage and task…" or, for a re-run, "Recreated from `<run>` · v… — parameters are
   pre-filled"), and actions `Cancel` + primary **Run flow** (disabled until every required param is
   set; a `.prep-warn` banner lists the missing keys). Param inputs are **scoped per slot** — the
   task's flattened index over the run's *enabled* tasks — so the same task used in two stages gets
   independent inputs. Slots are **grouped by stage** under a `Stage N` tag + a mono count
   (`"2 tasks · all at once"`); **every enabled task appears as a slot — including tasks with no
   declared env vars**, so each can still take ad-hoc parameters for this run (the empty-state copy
   reads "This workflow has no tasks — nothing to configure before running."). Each task renders a
   **card**: icon, name, a version tag (`v<runVer>`) with a green `latest` dot or an amber
   `v<curV> available` hint (from the workflow's exec pin), and a right-aligned summary
   (`N parameters · X added · Y missing`, or `no parameters` when the task declares none). A task with
   no declared and no added params shows an inline hint ("This task takes no parameters. Add one below
   to pass an ad-hoc parameter for this run."). Declared param rows show key + required/optional tag +
   a value input **pre-filled with the effective default** (workflow per-task override, else task env
   default; placeholder only when there is no default); missing required rows are highlighted. Below
   the declared rows, a dashed **Add parameter** button appends removable **ad-hoc** rows (key input +
   `added` badge + value input + remove ×) for keys the task doesn't declare. On launch, declared +
   ad-hoc values are sent as `task_params` keyed by slot index. Prepare validates required params
   before launching, then creates a `running` execution and navigates to the execution view.
4. **Tasks (list)** — card grid of reusable task definitions; each card: icon tile (accent glyph),
   title, description, footer tags (mono). Clicking a card opens the **Task detail** page (not the
   editor). `New task` opens the editor directly on a blank draft (**empty name** — the header shows a
     dimmed `New task` placeholder until the user types one, and the name field starts empty so the
     name-required validation applies immediately — with one
     step `bash-script.sh` seeded with `#!/usr/bin/env bash` / `set -euo pipefail` / a `# write your script here`
     comment / `echo "Hello"`).
   - **Task detail** — read-only, view-first page that mirrors **Workflow detail**. Header shell
     matches the editor (name + description, no icon tile) plus a mono **version picker**
     (`v1 · current`, older versions labelled with their saved-at). Header actions: `Clone` and a
     primary `Edit` button that navigates into the Task editor. Selecting an older version shows an
     amber restore banner ("Viewing v_N — an older version. Restoring brings it back as v_{cur+1}.")
     with `Back to current` + `Restore as v{cur+1}`. Body: a meta strip led by the 42px accent icon
     tile, then category · N steps · timeout · used by M workflows, a **Steps** card (collapsible per-step rows with syntax-highlighted
     bash/python code, run top-to-bottom), a **Parameters** card (key + required/optional pill +
     default value, or empty note), and a **Used by** card listing the workflows that reference the
     task (each row navigates to that workflow).
   - **Task editor** — tabs `Config | Steps`. `Cancel` returns to the detail page (or the list for a
     new task); `Save changes` (and creating a new task) persists and then returns to **wherever the
     editor was opened from** via `window.history.back()` — see §8.x Post-save navigation. **Validation
     (create & edit)**: the primary action (`Create task` / `Save changes`) is disabled until the draft
     is valid — a non-empty **name** is required, the **timeout** (when set) must be a whole number ≥ 1,
     and every **parameter** row must be valid. A required name surfaces in a `.field-err` banner below
     the header (visible from any tab) and reddens the `Config`-tab name input; timeout and parameter
     errors show inline in the `Config` tab. A step's delete button is disabled when it is the only
     step (a task needs at least one step); a task with zero steps is a permitted **no-op**, not an
     error. The `Steps` tab's `Bash` / `Python` add buttons append a new step named
     `bash-script-{n}.sh` / `python_script_{n}.py`, where `{n}` is one greater than the highest trailing
     number found across all existing step names (stripping the `.sh`/`.py` extension). Bash steps seed
     the standard `#!/usr/bin/env bash` / `set -euo pipefail` / `# write your script here` / `echo "Hello"`
     template; Python steps seed a `#!/usr/bin/env python3` script with a `main() -> int` entrypoint guarded
     by `if __name__ == "__main__": sys.exit(main())`. The `Config` tab ends (existing tasks
     only) with a **Delete task** section: a hairline-divided block with a danger `Delete task` button
     and a hint that adapts to usage. Delete is allowed only when no workflow references the task —
     when in use, the button is disabled and the hint names how many workflows still depend on it
     (remove it from those first). Clicking opens a confirm modal (scrim + card, Esc/Cancel dismiss);
     confirming calls the delete API and returns to the Tasks list. The backend re-checks usage and
     rejects with 409 if still referenced (surfaced as a toast).
   - Breadcrumbs: `Tasks › <task name>` on detail, `Tasks › <task name> › Edit` in the editor.
5. **Triggers editor** (per-workflow, not a top-level nav item) — cron/manual triggers for one
   workflow: schedule cards, a 5-cell mono cron editor, an enable/disable toggle. Reached from a
   workflow's row context menu (`Edit schedule`) or the workflow editor's Triggers tab; breadcrumb
   `Workflows › <workflow name> › Triggers`.
6. **Executions (list)** — all runs newest-first, segmented filter `All | Succeeded | Failed`, run
   rows (workflow name + run UUID, status badge, trigger + actor, duration, started, chevron),
   windowed pager at 50/page. Filter + page remembered. The **Started** cell is two-line: a relative
   "time ago" primary (`fmtAgeIso`, e.g. `8m ago` / `just now`) with the canonical display-zone
   timestamp as the mono secondary line; `queued` runs show a single `queued` line and no timestamp.
7. **Execution detail (run page)** — the primary surface:
   - Header: workflow name + status badge (running pulses), run UUID. Actions: a leftmost **`Workspace`**
     ghost button (folder icon; shown for any non-`queued` run) that reveals the run's `$WORKSPACE`
     directory in the OS file manager via the Electron shell (`window.backend.revealPath(ex.workspace_dir)`
     → `shell.showItemInFolder`; falls back to a toast in dev/browser), then the run-level actions:
     `Cancel` (danger) while `running`/`queued`, otherwise `Re-run` (ghost). `Re-run` opens the
     **Prepare-run** page prefilled with this run's params (the run's flat params are distributed back
     onto each task ref that declares the key), so values can be adjusted before launching a fresh
     execution. `Cancel` opens the **shared confirmation modal** (§8.x) before stopping the run.
     Additionally, on a **`failed`/`cancelled`** run that still has **stuck** (failed/cancelled) tasks,
     two **run-level aggregate recovery** buttons appear to the right of `Re-run` — **`Skip failures`**
     (ghost; warn-confirm "Skip failures & continue" → `POST …/skip-failed`) and **`Retry`** (primary;
     confirm "Retry failed tasks" → `POST …/retry-from-failure`). These act on every stuck task at once;
     after the action the page reloads and the header badge reflects the recovered status. They are
     **distinct from the surgical per-task controls** in the task panel below.
   - Run summary strip: Version, Started, Finished, Duration, Trigger.
   - Section title `N stages · M tasks`.
   - Two-column grid: **left rail** = stage + task rail (per stage: "Stage N" tag, then task rows with
     status dot, name, duration / "Skipped"; click selects — a **continued** (tolerated-failure) task
     shows the orange `continued` dot, not the red `failed` one). **Right column** = unified **task panel**:
     - Header: status dot, task name (mono), version pill, status badge (+ "continued" when tolerated),
       then **task-scoped controls** (small buttons, right-aligned; recovery happens per-task and is
       hidden once the run has `succeeded` cleanly):
       - **`Cancel`** (sm danger) — shown for a `running` task; warn-confirm modal ("Cancel task") then
         `POST /executions/{id}/tasks/{stage}/{task}/cancel`. Stops just that task (its own cancel flag);
         the rest of the run carries on and the run is left **degraded** so the task stays retriable.
       - **`Skip`** + **`Retry`** (sm ghost / sm primary) — shown for a `failed`/`cancelled` task whose
         **stage is still running** (run `running`) **or** on a terminal (`failed`/`cancelled`) run — so a
         failed task is actionable immediately, without waiting for its siblings to finish. `Skip`
         warn-confirms (message notes "its other tasks keep running" while the stage is live) then
         `POST …/tasks/{stage}/{task}/skip`; `Retry` calls `POST …/tasks/{stage}/{task}/retry`. Live (stage
         still running) these act on **this task only** — skip marks it skipped so the stage stops failing
         on it, retry re-runs just it; siblings and later stages are untouched. Terminal, skip marks the
         task skipped (if that clears the stage's last blocker the stage finishes and the run **resumes
         from the next stage**, else it stays terminal) and retry resets that task + all later stages to
         queued and resumes the run from the task's stage.
       - **`Skip`** (sm ghost) — shown for a `queued` task on a terminal run; warn-confirm then the same
         skip endpoint.
       Tasks are addressed **positionally** by `(stage_index, task_index)` — a `TaskOutcome` has no
       unique id within a stage (two refs may share a `task_id`).
     - **Attempt tabs** — always shown, one per attempt (single-attempt task still shows "Attempt 1").
     - **Info | Parameters | Logs** tabs. Info = per-attempt Start/End/Duration/Timeout/Auto-retries
       (`used / allowed`, or `none`); running attempts show `—` for End/Duration. Parameters = key/value
       rows (or empty note). Logs = terminal surface, per-step expandable rows with timestamped lines
       (`HH:MM:SS`).
8. **Settings** — Data Directory card: each row is a full-width
   bordered **field box** (folder-open icon + mono path + ghost "Change" button). First row =
   data-directory folder ("Change" opens the OS picker). Second row = **Execution history**: a header with the description on the left and a
   "Separate location" label + toggle on the right; below it the executions field — when off it is
   muted/dashed with a disabled "Change"; when on it is a live field whose "Change" opens its own OS
   picker. Third row = **`$WORKSPACE`** (where each execution checks out repos and does its work): same
   header + "Separate location" toggle pattern as execution history, with its own muted/live field and OS
   picker. Fourth row = a read-only callout (info icon) noting app config is
   stored per-user outside the data directory, with the config.json path. General card: Time zone select,
   Launch on startup toggle, Keep running in background toggle. About card (last in the column): a wrap
   of pill **link buttons** (30px tall, `--bg-2` fill, `--line-soft` border, 8px radius, icon + label) —
   currently just **View on GitHub** (`https://github.com/hansololz/worker-forge`, GitHub brand icon),
   opening in the default browser via `window.backend.openExternal(url)`. The card has no `.set-row`s, so
   the link row carries a `14px` top padding for vertical rhythm.
   A muted footer (top border, `11.5px` `--tx-dim`) carries the copyright (`© 2026 Worker Forge.
   All rights reserved.`).

**Interactions**: tab/filter/scroll memory per view; run-rail default selection = first
failed/cancelled/running/interrupted task else first; selecting a task defaults to its last attempt; selecting an
attempt defaults to its first failed/running/interrupted step; single-expand steps. Transitions: hover ~0.1s,
`.fadein` page entrance 0.25s, running dot/badge pulse 1.4s, pipeline connector flow 1.1s, cursor
blink. Responsive: grids collapse at 880px / 720px.

**Post-save navigation** (§8.x): saving or creating a workflow or a task calls `window.history.back()`
rather than navigating to a fixed destination — so the user returns to whatever page the editor was
opened from (workflow detail, the relevant list, the schedules page, etc.). Applies to: task create,
task save, workflow create, workflow save. (Routing is history-based: `nav(state)` pushes to
`window.history`; back/forward restore via `popstate`, with per-view scroll position remembered and
restored on return.) Other post-action navigations stay explicit — deletes go to the parent list,
launching a run goes to the execution view, and saving triggers returns to the workflow detail.

**Sidebar nav resets the stack** (§8.x): clicking a top-level sidebar tab (Workflows / Tasks /
Executions / Settings) starts fresh — it clears the back stack rather than deepening it. Each history
entry carries a depth index (`__idx`); a tab click unwinds to the base entry (`history.go(-depth)`)
and replaces it with the chosen view (`navRoot`), so afterwards the back stack holds only that page.
Breadcrumbs and in-page links still push normally.

**No cross-navigation state**: nothing transient is preserved across page transitions — navigating
away and back always loads fresh from saved data. The **workflow editor** and **task editor** seed
their draft from the entity's saved version on mount (so leaving mid-edit discards the in-progress
draft); the version-dropdown and entity-switch effects still reload the draft when the chosen version
or edited entity changes within a mounted editor, guarded (a `useRef` tracks the previous id/version)
so they never fire on the initial mount. The **active editor tab** is not remembered — editors open on
their default tab (workflow `Config`, task `Settings`), except an explicit `editTab` from navigation
(a deep-link into a specific tab) still wins. The executions list likewise resets its status filter and
page on each open. (Implemented in `src/editorDraft.js`.)

**Scrollbars**: native scrollbars are hidden everywhere (`scrollbar-width: none` + zero-width
`::-webkit-scrollbar`). The prominent scroll regions (`.content`, `.term-body`, `.dd-panel`,
`.add-task-menu`, `.code-input`) instead get a custom **overlay thumb** (`.oscroll-thumb`, 8px,
`position: fixed`, `z-index 9000`) that floats over content with no layout displacement. It fades in
while scrolling or on mouse-enter (opacity 0.5) and fades out ~900ms after the last scroll; hover/drag
raise it to 0.85. The thumb is draggable to scroll, sizes proportionally to the viewport (min 28px),
and repositions on resize/scroll and as the app re-renders (a `MutationObserver` re-attaches thumbs to
newly mounted regions). Implemented in `src/overlay-scroll.js`.

**Shared confirmation modal** (§8.x): one reusable `ConfirmModal` primitive backs every destructive
action — deleting a workflow (editor button + workflows-list context-menu `Delete`) and cancelling a
running execution. It is **controlled** (rendered only while open) and portalled to `document.body`:
a `.scrim` + centred `.modal-card` holding a `.modal-icon` tile, a `.modal-title`, a `.modal-msg`
(string or rich nodes — e.g. the target name in a `<b>`), and right-aligned `Cancel` + confirm
buttons. Two tones: `danger` (red icon tile, red confirm button — default) and `warn` (amber tile,
primary confirm button) for reversible-but-disruptive actions. Dismiss via Esc, scrim click, or
`Cancel`; confirming runs the action then closes. Wired through a single `ctx.confirm({ icon, tone,
title, message, confirmLabel, cancelLabel, onConfirm })` helper on the app context. Implemented as
`ConfirmModal` in `src/ui.jsx`.

**Design tokens** (full values in `src/index.css` `:root`): cool near-black surfaces
(`--bg-0..4`), warm-orange accent (`--accent` `oklch(0.74 0.155 52)`), status colors (running cyan,
success green, failed red, queued/warn amber, cancelled cool graphite (a deliberate stop
happened — muted, not alarming), interrupted magenta, continued orange, queued gray (solid dot),
skipped gray, each with a `*-dim` ~14–16% background). Radii 6/9/13px. Type: IBM Plex Sans (body) +
IBM Plex Mono (IDs, status meta, code). Icons: Font Awesome 6 Free as inline SVG — keep glyph
meanings (`workflows`, `tasks`, `history`, `play`, `skip`, `check`, `x`, `chevR`, `chevD`,
`terminal`, `settings`, `calendar`, plus task glyphs `git/package/flask/shield/rocket/db/box/...`).

---

## 9. Examples

> Not populated yet (intentionally deferred).

---

## 10. Implementation & build

The app is implemented as the reference three-process stack (§2). `src/index.css` holds the
**visual source of truth** (design tokens in `:root`); each view is an ES-module React component
wired to live API data.

### Layout

```
electron/main.ts      # shell: spawns/​supervises the backend on a free loopback port,
electron/preload.ts   #   owns the window + bridge: openDirectory, revealPath, openExternal, appVersion
index.html            # renderer entry (CSP locked to self + 127.0.0.1)
src/
  main.jsx            # mounts <App>; bundles IBM Plex Sans/Mono offline (@fontsource)
  index.css           # visual source of truth (design tokens in :root)
  ui.jsx              # Icon (Font Awesome 6, inline SVG) + Badge/Dot/Btn/Select/ConfirmModal/highlight
  api.js              # fetch client for every §6 endpoint (base = window.backend.httpUrl)
  model.js            # maps backend payloads -> view-model shapes; mutation actions
  App.jsx             # sidebar + topbar + hand-rolled router + ctx actions
  views/              # workflows, tasks, runs (execution detail), triggers, settings
engine/app/           # FastAPI: paths, models, storage (YAML), db (SQLite index),
                      #   runner, scheduler, routes/* — see §3–§7
engine/run.py         # uvicorn entry (127.0.0.1, --port)
scripts/dev.sh        # bootstrap venv + node deps, launch electron-vite dev
scripts/build.sh      # PyInstaller-freeze backend -> electron-vite build -> dmg/zip
scripts/clean.sh      # wipe build/dist artifacts, then delegate app-data removal to remove-data.sh
scripts/remove-data.sh # remove app data: per-user config dir + $WORKER_FORGE_HOME (prompts unless -y)
scripts/import-design.sh # import ~/Desktop/workflow.zip into design/ (flattens any wrapper/design folder)
```

### Running

- **Dev:** `bash scripts/dev.sh` — creates `engine/.venv` (Python 3.12+), installs deps,
  `npm install`, then `npm run dev`. Electron's main process spawns the backend itself on
  a random loopback port and injects it into the renderer via the preload.
- **Build (macOS):** `bash scripts/build.sh` — freezes the backend to a single binary,
  builds the bundles, and packages a `.dmg`/`.zip` into `dist/` (signing/notarization turn
  on automatically when the relevant env vars are present; see `electron-builder.cjs`).
- **Clean:** `bash scripts/clean.sh` (or `npm run clean`) — removes build/dist artifacts (`out/`,
  `dist/`, `engine/build/`, `engine/dist/`), then delegates app-data removal to `remove-data.sh`.
  Prompts before deleting app data; `-y` skips the prompt, `--dist` cleans only build artifacts and
  never touches app data.
- **Remove app data:** `bash scripts/remove-data.sh` — deletes the per-user config dir resolved like
  `paths.py:_config_dir()` (macOS `~/Library/Application Support/Worker Forge`, Linux
  `${XDG_CONFIG_HOME:-~/.config}/worker-forge`, else `${APPDATA:-~/AppData/Roaming}/Worker Forge`) plus
  `$WORKER_FORGE_HOME` when set. Prompts first; `-y` skips the confirmation.
- **Import design bundle:** `bash scripts/import-design.sh` — unzips `~/Desktop/workflow.zip` and copies
  the design-reference bundle into `design/`, overwriting matching files. The archive's files may sit at
  its root or nested inside a wrapper / `design/` folder; single-directory wrapper layers are peeled off
  so the files land directly in `design/`. macOS `__MACOSX`/`.DS_Store` cruft is dropped. Runs straight
  through with no confirmation prompt.

- **App icon:** the desktop/dock icon is the brand mark — a macOS-squircle rounded square in the accent
  orange with the white FontAwesome solid `hammer` glyph (matching the in-app sidebar brand and the
  startup splash). It is generated procedurally by `scripts/make_icon.py` (Pillow only; the FA hammer is
  rendered from its real SVG path via a small built-in path flattener, so there is no SVG-renderer/native
  dependency) and assembled into `build-assets/icon.png` + `icon.icns` by `scripts/make_icon.sh`.
  **Packaged builds** read `build-assets/icon.icns` via `electron-builder.cjs` (`scripts/build.sh`
  regenerates it if missing). **Dev** runs use Electron's default dock icon, so the main process calls
  `app.dock.setIcon(build-assets/icon.png)` on launch (macOS, unpackaged) so the dev app matches the build.

A fresh data directory starts empty — no example tasks or workflows are seeded.

## 11. Deviations & reconciliations

Notable points where the UI layout and the normative model (§1–§8) were reconciled:

- **Settings → Data Directory card.** Beyond the General card, §8.8 requires a Data Directory card.
  It is built from the same `.card`/`.set-row` primitives (path field + folder icon + "Change…" → OS
  picker + counts, plus the read-only callout that config lives outside the data directory).
- **Per-ref retries/timeout.** A workflow task-ref persists only `task_version`, `enabled`,
  `continue_on_failure`, and per-ref `params` (§4.1); `retries`/`timeout` are task-level
  (§4.2), so the editor's per-task Execution panel shows them read-only (task defaults).
- **Run params.** `POST /api/executions` takes a flat `params` `{KEY: value}` plus per-slot
  `task_params` `{slotIdx: {KEY: value}}` (§6.5); the Prepare page collects values per task slot
  (incl. ad-hoc "added" keys) and sends them keyed by slot index — never flattened.
- **Execution detail** is rendered from real backend execution YAML (stages → tasks →
  attempts → steps → logs), and the run page polls while a run is `running`.

## 12. Testing

Three layers: **unit** (logic in isolation), **integration** (API contract + real runs against
the live app), **E2E** (the whole Electron app driven end-to-end). All three run in Docker for
reproducibility; backend + frontend-unit also run natively.

### Tooling

| Layer | Stack |
| --- | --- |
| Backend unit + integration | `pytest`, `pytest-cov`, `freezegun`, FastAPI `TestClient` (httpx) |
| Frontend unit | `vitest` + `@testing-library/react` + `jsdom` |
| FE↔BE integration | `vitest` (node env) driving `src/api.js` against a live backend |
| E2E | `@playwright/test` Electron driver, under `xvfb` in Docker |

Backend dev deps are pinned in `engine/requirements-test.txt`; frontend test deps + scripts live in
`package.json`. Pytest config sits in `engine/pyproject.toml` (`[tool.pytest.ini_options]`); vitest in
`vitest.config.ts`; playwright in `playwright.config.ts`.

### Isolation

Every backend test runs in a throwaway data + config dir. `paths.py` re-reads `$WORKER_FORGE_HOME`
and `_config_dir()` on every call (no caching), so a per-test `monkeypatch` (the `sandbox` autouse
fixture in `engine/tests/conftest.py`) fully isolates the YAML tree, the SQLite index, and the
on-disk config — the developer's real Worker Forge data is never touched. The E2E fixture points
`WORKER_FORGE_HOME` at a fresh temp dir per run. Timezone-dependent assertions pin `TZ=UTC`.

### Layout

```
engine/tests/
  conftest.py             # sandbox fixture, TestClient, make_task/make_workflow, poll_execution
  unit/                   # models, paths, storage, db, scheduler (cron), runner (_resolve_params)
  integration/            # health, workflows/tasks/triggers/settings APIs, real run, crash recovery
tests/                    # frontend + e2e (Node side)
  setup/                  # vitest.setup.js, backend-server.js (local boot helper)
  unit/                   # cron-preview (nextCronRun), format helpers, api.js, ConfirmModal
  integration/            # api-contract.test.js — api.js vs a live backend (skips w/o WF_BACKEND_URL)
  e2e/                    # Electron end-to-end (Playwright)
    CUJ.md                #   critical-user-journey catalog (ids + groups)
    electron.fixture.mjs  #   launch built app + resolve main window (shared base test)
    helpers/              #   reusable journey actions (tasks.mjs: new-task flow)
    specs/                #   one *.spec.mjs per CUJ group; test() per CUJ id
                          #     smoke, run-execution, task-create (CUJ-TASK-1/2)
docker/
  backend.Dockerfile      # python:3.12-slim → pytest
  frontend.Dockerfile     # node:20-slim → vitest unit
  e2e.Dockerfile          # node + python + Electron libs + xvfb → playwright
  docker-compose.test.yml # services: backend-tests, frontend-tests, fe-integration, e2e
scripts/test/             # one script per (component, type); no script mixes the two
  engine-unit.sh          # pytest tests/unit
  engine-integration.sh   # pytest tests/integration
  app-unit.sh             # vitest tests/unit
  app-integration.sh      # vitest tests/integration (boots a live engine fixture)
  app-e2e.sh              # playwright over the built app (docker default)
  engine.sh               # run all engine tests (unit + integration)
  app.sh                  # run all app tests (unit + integration + e2e)
  test.sh                 # umbrella by component: [engine|app|all] [--local]
  lib-test.sh             # shared COMPOSE / venv / free-port / health-wait helpers (sourced)
.github/workflows/test.yml# 3 CI jobs (backend, frontend native; e2e via docker)
```

### What each layer proves

- **Backend unit** — cron next-fire math (time-injected), layered param resolution, YAML roundtrip +
  immutable versioning, index reconcile, model/vocab validation, data-dir resolution.
- **Backend integration** — every §6 endpoint's contract, a real workflow launched and run to
  `succeeded`/`failed` via actual bash subprocess steps with per-step logs, and crash recovery
  (`running` orphan → `interrupted` on boot, §6/§7).
- **Frontend unit** — `nextCronRun` preview, display formatters, the `api.js` request/response/error
  contract (mocked `fetch`), and `ConfirmModal` behavior.
- **FE↔BE integration** — `api.js` against a live backend, catching drift the mocked unit tests can't.
- **E2E** — the packaged renderer + spawned backend boot, the shell paints, and a workflow launched
  through the renderer's own bridge runs to success.

### Running

Each script runs **exactly one component + one type** — the engine (pytest) and app
(vitest/playwright) suites never share a script. **Unit suites run natively; integration and e2e run
in Docker by default** (reproducibility), and every integration/e2e script takes `--local` to run on
the host instead. `scripts/test/lib-test.sh` holds the shared `COMPOSE` invocation, venv / free-port /
health-wait helpers, and auto-bootstraps `engine/.venv`:

- `scripts/test/engine-unit.sh` — pytest `tests/unit`, pure logic. Native. No Node/app tooling.
- `scripts/test/engine-integration.sh` — pytest `tests/integration` (TestClient + real bash-subprocess
  runs). **Docker** (`backend-tests` image, `pytest tests/integration`); `--local` for native.
- `scripts/test/app-unit.sh` — vitest `tests/unit` (mocked `fetch`, jsdom). Native.
- `scripts/test/app-integration.sh` — drives `api.js` against an engine booted as a black-box fixture
  (sandboxed `WORKER_FORGE_HOME`, torn down on exit). **Docker** (runs itself `--local` inside the
  `e2e` image); `--local` for native.
- `scripts/test/app-e2e.sh` — Playwright over the built Electron app. **Docker** (`e2e` image, xvfb);
  `--local [--no-build]` runs against the host display.

Two per-component aggregators run every type for one component: `scripts/test/engine.sh` (unit +
integration) and `scripts/test/app.sh` (unit + integration + e2e). Both forward `--local` (and app
forwards `--no-build`) to the integration/e2e steps.

`scripts/test/test.sh [engine|app|all] [--local] [--no-build]` is the umbrella that fans out to those
aggregators. Native npm/pytest equivalents also exist: `npm run test:unit` / `test:integration` /
`test:e2e`, and `cd engine && pytest`.

E2E is Linux-only (Electron under `xvfb`); the real ship target stays macOS. It requires a prior
`npm run build` and a runnable backend (`engine/.venv` or `python3` on PATH) — the `e2e.Dockerfile`
provisions both.
