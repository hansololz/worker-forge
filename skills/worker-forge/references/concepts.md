# Concepts and vocabulary

This file is the canonical glossary for Worker Forge. Read it once before your first forge; refer back when a term feels
slippery.

## Worker

A single-purpose, locally-executed program. The user runs it on their own machine — by clicking, by schedule, by cron,
or by event — and the work finishes without a developer in the loop.

The full definition is in the user's project at `worker.md`. The properties that matter for this skill:

- One worker, one job.
- Runs through a CODE → LOCAL → HOSTED cascade at run time.
- Triggered by click, schedule, cron, or event.
- Built as a native artifact for the target OS (`.exe` on Windows, an executable script or `.app` on macOS, an ELF on
  Linux).
- Self-contained: the recipient doesn't install Python or pip dependencies before running it.

## Worker Forge

The agent skill that produces workers — that's this skill. It runs the four-phase cycle (interview, cascade design, code
generation, packaging) and is also responsible for reforging existing workers when the spec changes.

## Workshop

The persistent directory on the user's machine that holds every worker they've forged plus the resources the Forge needs
to rebuild them.

- One Workshop per user.
- Default location: `~/worker-forge-workshop/`. Confirm with the user on first use.
- Layout: see the `## The Workshop` section in `SKILL.md`.

The Workshop is the source of truth, not the built artifact in `dist/`. The artifact is what the user (or recipient)
runs; the Workshop is what the Forge reads and modifies.

## Cascade

The runtime contract for every worker. Each unit of work has a tier preference, and the worker walks from the cheapest
tier upward, escalating only when the current tier can't satisfy the unit.

| Tier   | Mechanism                                  | When                                                      |
|--------|--------------------------------------------|-----------------------------------------------------------|
| CODE   | Deterministic Python                       | A precise rule fits (regex, parser, HTTP, library call)   |
| LOCAL  | Local LLM via Ollama on the user's machine | Fuzzy classification, small summaries, simple extractions |
| HOSTED | Hosted frontier model with user's API key  | Genuinely needs frontier-model judgment                   |

Cascade design happens at forge time. Cascade execution happens at run time. See `cascade.md` for the design rules and
`assets/worker_runtime.py` for the runtime mechanics.

## Triggers

How a worker starts running. The forge interview must pin one of these down.

- **Click.** The user double-clicks the built artifact. Simplest path.
- **Schedule.** The worker runs at a fixed time (daily, hourly, weekdays at 8am). The worker itself doesn't install the
  schedule — the user wires it into Task Scheduler / launchd / systemd. The worker just exits cleanly when done so it
  composes with a scheduler.
- **Cron.** A recurring expression on the user's machine drives the worker. Same shape as Schedule from the worker's
  perspective; the user owns the cron entry.
- **Event.** Another process invokes the worker when a condition fires (file added to a folder, webhook, OS
  notification). Again, the worker is the runner; the watcher is somewhere else.

A worker runs, finishes, and exits — every trigger mode. Workers are never long-running services.

## Artifact

The built, distributable file in `dist/`. On Windows it's `<name>.exe`; on macOS it's an executable (or `.app` if the
user wants it); on Linux it's an ELF binary.

The artifact is what the user shares. The Workshop folder is what the Forge maintains.

## Reforge

The cycle of modifying an existing worker rather than writing a new one. The Forge reads `WORKER.md` and `AUTHORING.md`,
makes the smallest change that satisfies the user's request, and rebuilds. See `reforge.md`.

## `WORKER.md` vs `AUTHORING.md`

Two files, two audiences, one folder.

- `WORKER.md` is the worker's plain-language spec. Skill-style metadata at the top (`name`, `description`), cascade plan
  in the body. Read this to know what the worker does.
- `AUTHORING.md` is the rationale layer — the interview, the decisions, the alternatives considered. Read this to know
  *why* the worker is shaped the way it is.

Keeping them separate keeps `WORKER.md` short enough to skim and lets `AUTHORING.md` grow without polluting the spec.
