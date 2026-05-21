# Worker Forge: design

This doc explains the two pieces of the system — Worker and Worker Forge — and how they fit together. Read it before
touching the code or proposing a change to the model. The audience is engineers contributing to Worker Forge.

## Problem

A lot of useful work on a desktop is small, manual, and repetitive: rename a folder of files, summarize today's PDFs,
check a page for changes, build a weekly digest. Each task is too small to justify hiring a developer, but the user does
it forever.

The hosted-LLM solution has three problems:

1. **Cost.** Hosted-LLM pricing today is subsidized by VC funding and subject to change.
2. **Availability.** Providers shut down, deprecate models, and change pricing on their own schedule.
3. **Connectivity.** Hosted calls require an internet connection at run time, and many useful tasks should run on a
   laptop in airplane mode.

Worker Forge bets on three things: local hardware keeps getting more capable at running models, local models keep
getting better, and many subtasks don't need a model at all.

## Goals

- A non-developer describes a task in plain language and walks away with a runnable program.
- Programs run locally and finish without a network connection unless a unit has explicitly escalated to the hosted
  tier.
- Each program does exactly one thing.
- Programs are reforgeable: a later change to the spec produces an updated program without rewriting from scratch.
- The same Forge targets Windows, macOS, and Linux.

## Non-goals

- A general-purpose IDE or scripting platform.
- Multi-user applications, servers, or long-running daemons.
- Real-time streaming or interactive UIs beyond a simple console.
- A marketplace, an updater, or a desktop UI for the Forge itself. Listed as future work, not in scope here.

## The pieces

### Worker

A worker is a single-purpose, locally-executed program. See [`worker.md`](./worker.md) for the full definition and
invariants. For the purposes of this design doc, the relevant properties are:

- One worker, one job.
- Runs through a CODE → LOCAL → HOSTED cascade at run time.
- Triggered by click, schedule, cron, or event.
- Built as a native artifact for the target OS (e.g., `.exe` on Windows).

Each worker lives in its own folder:

```
root/workers/<worker-name>/
├── AUTHORING.md   # task description, interview notes, decisions
├── WORKER.md      # plain-language spec; metadata + cascade plan
├── resources/     # prompts, schemas, templates, sample inputs
├── build/         # build scripts and runtime for the target OS
└── dist/          # built artifact (e.g., my-worker.exe)
```

`root` is a directory the user picks the first time they forge a worker. Each worker folder is self-contained: it
includes the runtime, prompts, and build scripts the worker needs, with no shared parent dependency.

`WORKER.md` is structured like a Claude skill: it starts with a `name` and `description` metadata block and reads as the
worker's plain-language entry point. `AUTHORING.md` is the rationale layer — the interview transcript, the decisions,
the discarded alternatives. The two files together let a later forge reason about the worker without code archeology.

### Worker Forge

Worker Forge is the agent skill that produces workers. It runs a four-phase cycle:

1. **Interview.** Ask the user what the task is. Pin down edge cases, failure handling, output location, what counts as
   success. The interview is the highest-leverage phase. Edge cases not surfaced here will fail at run time.
2. **Cascade design.** Decompose the task into units of work. For each unit, pick the cheapest tier that can do the
   job (CODE, LOCAL, or HOSTED). Write the plan into the worker's `WORKER.md`.
3. **Code generation.** Fill in the worker template, instantiate the runtime, wire the units together, and lay out the
   worker folder under `root/workers/`.
4. **Packaging.** Produce a build script for the target OS. The Forge always tries to run the build itself first — but
   only after asking the user for permission. If the host OS doesn't match the target, or the build fails, the Forge
   hands the script to the user with instructions for running it on a matching machine. Either way the output is the
   distributable artifact in `dist/`.

The Forge is also responsible for **reforging**: when the user comes back with a changed requirement, the Forge reads
`AUTHORING.md` and `WORKER.md`, modifies the affected unit, and rebuilds. Full regeneration is reserved for changes
large enough that a patch is messier than a redo.

## How they come together

Three lifecycles run on top of the worker folders:

### Initial forge

```
user (plain-language task)
        │
        ▼
Worker Forge ── interview ──▶ cascade plan ──▶ code gen ──▶ build script
        │                                                       │
        └─────── writes into root/workers/<name>/ ◀─────────┘
                                  │
                                  ▼
                  Forge asks user: "run build now?"
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
       yes, host OS matches              no, or host OS mismatch
                │                                   │
                ▼                                   ▼
       Forge runs build script         Forge hands script to user
                │                       with run instructions
                │                                   │
                └─────────────────┬─────────────────┘
                                  ▼
                 dist/<worker>.<os-extension>  (the artifact)
```

The Forge writes `AUTHORING.md`, `WORKER.md`, the runtime, the resources, and the build script into
`root/workers/<name>/`. The Forge then asks the user whether to run the build now. On confirmation, and if the host
OS matches the target, the Forge runs the script itself. Otherwise it hands the script to the user with instructions
for running it on a matching machine. The artifact lands in `dist/`.

### Run

```
user click ─┐
schedule  ──┼──▶ artifact ──▶ cascade runtime
cron      ──┤                       │
event     ──┘                       ▼
                          ┌─────────┴─────────┐
                          │ CODE  → LOCAL  → HOSTED
                          └───────────────────┘
                                    │
                                    ▼
                                  output
```

The artifact is self-contained. The runtime walks the cascade unit by unit, escalating only when the current tier can't
satisfy the unit. The hosted tier requires the user's own API key, prompted at first run and stored in the OS keyring.

### Reforge

```
user (change request) ──▶ Worker Forge
                              │
                              ▼
                  reads AUTHORING.md + WORKER.md
                              │
                              ▼
                 modifies affected cascade unit
                              │
                              ▼
                  rebuilds artifact in dist/
```

Reforge is the common case after the first build. A worker that can't be reforged from its own `AUTHORING.md` failed
Phase 1.

## Key design decisions

### The cascade is the runtime contract

Every worker walks CODE → LOCAL → HOSTED for every unit. This forces the Forge to pick a tier at design time instead
of defaulting to a model call. Workers built this way continue to function when a hosted model is unavailable.

### One worker per folder, one job per worker

Workers don't compose by sharing code. A workflow that spans two jobs is two workers, orchestrated externally (by a
third worker, by cron, or by the user). The single-responsibility rule keeps `WORKER.md` short enough to be a useful
spec and keeps reforge tractable.

### `AUTHORING.md` and `WORKER.md` are separate

`WORKER.md` answers "what does this do." `AUTHORING.md` answers "why does it do it that way." Keeping them separate
means the user-facing spec stays short and the rationale layer can grow as the worker is reforged without polluting the
spec.

### Plain Python source ships with each worker

Each worker folder holds source, not just artifacts. The Forge needs to read and modify the source to reforge. The user
can audit it. The artifact in `dist/` is the distributable; the worker folder is the source of truth.

### Target OS is chosen at forge time

The Forge asks the user which OS the worker targets and emits a build script for that OS. Cross-compilation is not
supported. A worker built for Windows is built on Windows. The user needs access to a machine for each target OS.

## Failure modes

- **App-shaped requests.** The user describes a multi-screen UI or a server. The Forge pushes back and offers to narrow
  the request to a worker-shaped piece, or declines.
- **LOCAL tier unreliable for a unit.** Forge-time evaluation catches this and the unit escalates to HOSTED. The
  escalation is recorded in the cascade plan, not silently chosen at run time.
- **Hosted API key missing.** Run time prompts the user, stores the key in the OS keyring. If the worker has no hosted
  units, the prompt never appears.
- **Build host doesn't match target OS.** The Forge does not attempt cross-compilation. It hands the build script to
  the user with instructions for running it on a machine that matches the target. This is a known branch of the initial
  forge, not an error.
- **User declines the build prompt.** The Forge skips the build and leaves the source in the Workshop. The user can run
  the build script themselves later, or ask the Forge to retry the build at any point.
- **Reforge with sweeping changes.** When `AUTHORING.md` and the requested change diverge enough that a patch is messier
  than a redo, the Forge does a fresh forge and replaces the worker folder. The previous `AUTHORING.md` is preserved in
  a `history/` subfolder for reference.

## Open questions

- **Scheduling across OSes.** Native schedulers (Windows Task Scheduler, launchd, cron) all work differently. Do we ship
  a thin cross-platform scheduler with each worker, or generate native scheduler config at forge time?
- **Worker updates.** Today a reforge produces a new artifact the user has to redistribute by hand. Is there a
  lightweight update channel that doesn't require running a server?
- **Artifact attestation.** A built `.exe` should be verifiable against the source in the worker folder. What's the
  minimum scheme that gives the recipient confidence?
- **Local model selection.** Different users have different Ollama models installed. Does the Forge pin a model per
  worker, or query the host at run time and pick the best available?

## Future work

Listed in `initial-context.md` and out of scope for the current design:

- A workers marketplace.
- A desktop UI for Worker Forge.
- Automated security scanning of generated workers.
- A CLI surface for power users who skip the agent interview.
