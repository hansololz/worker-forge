# Worker Forge

**A desktop workflow orchestrator for the automation you keep running by hand.**

Worker Forge turns repetitive multi-step jobs — builds, data pulls, deploys, ops chores — into reusable workflows you can schedule, run, and watch from one dark, native app. No YAML wrangling in a terminal, no cron jobs scattered across machines, no SSH-ing in to check whether last night's run actually finished.

Cross-platform by design, **macOS-first** today.

---

## Why Worker Forge

- **Local-first, no cloud.** Everything runs on your machine. The backend binds to loopback only; your scripts, logs, and run history never leave your disk.
- **Files are the source of truth.** Every workflow, task, and execution is a plain YAML file in a directory you choose. Point it at a synced or version-controlled folder to share workflows across machines. The SQLite index is just a rebuildable cache.
- **Parallel stages, sequential pipeline.** A workflow is an ordered list of stages; tasks inside a stage run in parallel, stages run one after another. The run advances only when every task in the current stage finishes.
- **Real recovery, not just red Xs.** Retry a single failed task, retry a whole run from where it stopped, or skip failures and finish degraded — live, while siblings keep running, or after the run goes terminal. Cancel kills the actual process group, so nothing survives behind your back.
- **Crash-safe.** If the app dies mid-run, orphaned executions are marked `interrupted` on restart instead of lingering as fake "running" — with a clear audit trail and untouched workspaces to inspect.
- **Scheduling that's auditable.** Attach a cron trigger to any workflow. Triggers are versioned with the workflow definition, so your schedule is pinned, rolls back with the rest, and the live countdown to the next fire is right there in the list.

---

## How it works

```
Workflow  →  ordered Stages  →  parallel Tasks  →  sequential Steps (bash / python)
```

- **Task** — a reusable definition: one or more shell/python steps, typed env params, retries, timeout. Shared across workflows.
- **Workflow** — stages wiring tasks together, with per-task param overrides and version pinning.
- **Trigger** — a cron schedule or manual launch attached to a workflow.
- **Execution** — one run, recording every task attempt and per-step log line.

Each run gets its own `$WORKSPACE` directory, shared by all its steps (checkout-once, CI-style) and kept afterward so you can inspect the working tree. Every edit mints a new immutable version — full history, instant rollback.

---

## The app

A single-page dark UI with four views:

- **Workflows** — list with live schedule countdowns and last-run status; pipeline diagram with animated connectors on the detail page.
- **Tasks** — a library of reusable task definitions with syntax-highlighted steps.
- **Executions** — every run, newest-first, drilling into per-stage, per-task, per-attempt logs that stream live.
- **Settings** — data directory, timezone (full IANA support, DST-correct), launch-on-boot, background running, and separate roots for run history and workspaces.

Frameless native window, timezone-aware timestamps everywhere, and a collapsible sidebar.

---

## Architecture

Three processes:

| Process | Role |
|---|---|
| **Shell** (Electron) | Native window, OS dialogs, launch-on-boot, supervises the backend |
| **Backend** (FastAPI, loopback) | Filesystem data dir, SQLite index, scheduler, task runner |
| **Renderer** (React) | High-fidelity dark UI over a local HTTP API |

The data model, storage layout, and API are what's normative — the frameworks are the reference implementation. The full spec lives in [`SPEC.md`](./SPEC.md).

---

## Getting started

```bash
# install
npm install

# run in dev
npm run dev

# build a macOS app
npm run pack:mac
```

Your data lives in `~/Library/Application Support/Worker Forge/` by default (override in Settings or via `WORKER_FORGE_HOME`).

---

## Status

macOS is the focus today; Windows and Linux are on the roadmap and nothing in the design blocks them. `SPEC.md` is the source of truth and holds enough detail to rebuild the app from scratch.
