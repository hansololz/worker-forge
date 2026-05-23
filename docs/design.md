# Worker Forge

This doc explains the two pieces of the system — Worker and Worker Forge — and how they fit together. The audience is
engineers contributing to Worker Forge.

## Goal

Make small, repetitive manual desktop tasks worth automating. Today, writing a script to automate some tasks often costs
more time than the script saves. Worker Forge lets the user describe the task in plain language and walk away with a
small program that automates it.

## Background

### Problem

A lot of useful desktop tasks are small, manual, and repetitive:

- Checking a webpage for a specific change.
- Pulling a daily digest from a set of sources.

These tasks stay manual for three reasons:

- Automating them costs more than they save.
- Most users can't write the script themselves.
- General-purpose tools don't cover them — the tasks are too niche.

Automating them with hosted-LLM solutions has three problems:

- **Cost.** Hosted-LLM pricing today is subsidized by investor and corporate capital, subject to change, and may become
  cost prohibitive.
- **Availability.** Providers shut down and deprecate models on their own schedule.
- **Connectivity.** Hosted calls require an internet connection at run time while many of these tasks could run on a
  laptop in airplane mode.

### Insights

Two observations make this approach feasible.

#### Most automation work is deterministic

Most of the tasks a user actually wants automated are simple and deterministic. They don't need a model at run time.
A model is only needed to translate the user's plain-language description into the script that does the automation work.

An upside is that the tasks are also *specific*. Users can get values from a program that fits exactly what they want.

#### Local LLMs are improving fast

For the tasks that do need a model at run time, local LLMs are now often good enough. The bets are:

- Local models are going to become more capable per parameter.
- Local models are going to be easier to run with tooling improvements.
- Local machines are going to be more capable at running AI models (NPUs and Apple Silicon).

## Requirements

- **Plain-language input.** A user describes a task and receive a runnable program.
- **Local-first execution.** Programs run on the user's machine.
- **Single-purpose programs.** Each program does exactly one thing.
- **Cross-platform.** Programs can be built for Windows, macOS, and Linux.

## Non-Requirements

- A general-purpose IDE or scripting platform.
- Multi-user applications, servers, or long-running daemons.
- A marketplace, an updater, or a desktop UI for the Forge itself. Listed as future work, not in scope here.

## Solution

### Definition

A **Worker** is the program the user runs on their own machine — a single-purpose, locally-executed binary that does
one repetitive task well. It's invoked by click, schedule, cron, or event. The artifact is whatever the target OS
prefers natively: `.exe` on Windows, `.app` bundle on macOS, AppImage or static binary on Linux.

A **Workspace** is the folder that holds everything needed to build, audit, and modify a Worker. It includes the spec,
sources, build scripts, and distributable. Each worker has exactly one Workspace, and the Workspace, not the binary,
is the source of truth.

```
root/workspaces/<worker-name>/
├── AUTHORING.md   # original task description, interview notes, decisions
├── WORKER.md      # plain-language spec: what it does, trigger, cascade plan
├── resources/     # prompts, schemas, templates, sample inputs needed at run time
├── build/         # build scripts and runtime for the target OS
└── dist/          # built worker artifact (e.g., my-worker.exe)
```

`WORKER.md` is structured like a Claude skill: it starts with a `name` / `description` metadata block and reads as
the worker's plain-language entry point. `AUTHORING.md` contains the interview transcript, decisions,
and discarded alternatives. Worker forge skill uses the two file to reason about the worker program.

**Worker Forge** is the agent that produces and edits Workspaces. On a new build it runs four phases:

1. **Interview.** Pin down the task, edge cases, failure handling, output location, what counts as success. This
   is the highest-leverage phase — edge cases not surfaced here will fail at run time.
2. **Cascade design.** Decompose the task into units of work. For each unit, the Forge tries CODE first — a regex,
   parser, or HTTP call that does the job deterministically. Only if no deterministic option fits does it fall back to
   LOCAL (a local LLM via Ollama). Only if LOCAL can't reliably handle the unit does it escalate to HOSTED (a frontier
   model called with the user's own API key). The cheaper tier is always faster, more available, and more predictable
   than the one above it, so escalating without cause makes the worker worse at run time. Examples: parsing a date out
   of a filename is CODE; classifying a document as "invoice" vs. "receipt" is LOCAL; summarizing a fifty-page
   contract well is HOSTED. The chosen tier for each unit lands in `WORKER.md` so a later reforge can see what was
   decided.

   | Tier   | Mechanism                                 | Use for                                                   |
      |--------|-------------------------------------------|-----------------------------------------------------------|
   | CODE   | Deterministic logic (regex, parser, HTTP) | Anything expressible as a precise rule                    |
   | LOCAL  | Local LLM via Ollama on the user's box    | Fuzzy classification, small summaries, simple extractions |
   | HOSTED | Hosted LLM with the user's API key        | Tasks that need frontier-model judgment                   |

3. **Code generation.** Fill in the worker template, instantiate the runtime, wire the units together, and lay out the
   Workspace under `root/workspaces/`.
4. **Packaging.** Produce a build script for the target OS. The Forge tries to run the build itself first, after
   asking the user for permission. If the host OS doesn't match the target, or the build fails, the Forge hands the
   script to the user with instructions for running it on a matching machine. Either way the output is the worker
   artifact in `dist/`.

When the user comes back with a change, the Forge **reforges**: it reads `AUTHORING.md` and `WORKER.md`, modifies the
affected unit, and rebuilds. Full regeneration is reserved for changes large enough that a patch would be messier than
a redo.

Five invariants hold for every worker. An artifact that breaks any one of them isn't a worker.

1. **Single responsibility.** One worker does one job. Two jobs means two workers.
2. **Local-first execution.** The worker runs without a hosted model unless a specific unit has explicitly escalated
   to HOSTED.
3. **The recipient is not the author.** Setup steps, prompts, error messages, and outputs make sense to someone who
   didn't write the spec.
4. **Cheapest tier first.** A model call where a regex would do is a bug.
5. **Reforgeable.** `AUTHORING.md` and `WORKER.md` carry enough context for the Forge to modify the worker later
   without starting over.

A worker isn't the right shape for one-off tasks ("summarize this one PDF" is a request, not a worker), multi-screen
applications, long-running services like daemons or streams, or anything that fundamentally needs a server backend
the user doesn't own. The Forge pushes back on these during the interview rather than producing a worker that doesn't
quite fit.

### How they come together

Three lifecycles run on top of a Workspace: the initial forge that creates it, the runs that follow once a worker has
been built from it, and reforges when the user comes back with a change.

#### Initial forge

```
user (plain-language task)
        │
        ▼
Worker Forge ── interview ──▶ cascade plan ──▶ code gen ──▶ build script
        │                                                       │
        └─────── writes into root/workspaces/<name>/ ◀───────┘
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

The interview and the cascade plan are the parts of the forge that actually matter; the code generation and build
that follow are mostly mechanical once those two are right. The branch at the bottom — "does the build host's OS
match the target?" — is the only place the initial forge can stall, and it stalls into a clean handoff rather than a
failure: the user gets the build script and runs it on a machine that matches.

#### Run

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

The artifact is self-contained: no Python on the target machine, no separate runtime install, just the binary the
user double-clicks or the scheduler invokes. The cascade runtime walks units in the order the Forge planned them,
only falling back to a higher tier when the current one signals it can't satisfy the unit. When a deterministic
CODE step can't solve a unit, the runtime tries an installed local model on the user's machine before
considering a hosted call — so workers keep running offline whenever a local model is available and capable enough.
The hosted tier prompts for the user's API key on first need and stores it in the OS keyring; the user can also
provide keys ahead of time so the prompt never appears, and if the worker has no hosted units the prompt never
appears at all.

#### Reforge

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

Reforge is the common case after the first build, and it's the test the Workspace has to pass: if the Forge
can't reconstruct enough context from `AUTHORING.md` and `WORKER.md` to make a confident change, the original
interview failed. Most reforges touch one unit and rebuild. Full regeneration is reserved for changes large enough
that a patch would be messier than a redo.

### Key design decisions

These are the choices that aren't obvious, with the reasoning behind each.

#### The cascade is the runtime contract

Every worker walks CODE → LOCAL → HOSTED for every unit of work. The point isn't only to be cheap at run time — it's
to force the Forge to pick a tier at design time instead of reaching for a model call by default. A worker built this
way keeps working when a hosted model is unavailable, when the user is offline, and when a provider changes its terms
out from under them. "Just call the LLM" is a tempting default; the cascade exists to make that default
uncomfortable.

#### One worker, one job

Workers don't compose by sharing code. A task that spans two jobs is two workers, orchestrated externally — by a
third worker, by cron, or by the user themselves. The single-responsibility rule keeps `WORKER.md` short enough to be
a useful spec, keeps reforge tractable, and means a failure in one worker doesn't take down a workflow that happens
to chain through it.

#### `AUTHORING.md` and `WORKER.md` are separate files

`WORKER.md` answers "what does this do." `AUTHORING.md` answers "why does it do it that way." Splitting them keeps
the user-facing spec short and stable while the rationale layer grows freely across reforges, without cluttering up
the spec the user actually reads.

#### The Workspace ships with every worker, not just the binary

Each Workspace holds Python source alongside the built artifact. Three reasons: the Forge needs to read the source to
reforge, the user needs to be able to audit what's running on their machine, and a worker without its Workspace is a
black box the next maintainer can't reason about. The artifact in `dist/` is the distributable; the Workspace is the
source of truth.

#### Target OS is chosen at forge time

The Forge asks the user which OS the worker will run on and emits a build script for that OS specifically. No
cross-compilation: a worker for Windows is built on Windows. This trades convenience for predictability —
cross-compilation introduces a class of "works on my machine" bugs that are hard to catch and harder to debug from
inside a Forge run.

### Failure modes

The Forge expects to hit each of these. Anything not on this list and not handled inline in the run or forge code is
a bug worth investigating.

- **The request isn't worker-shaped.** The user describes a multi-screen UI, a server, or a long-running service. The
  Forge pushes back, offers to narrow the request to a worker-shaped piece, or declines.
- **The LOCAL tier isn't reliable enough for a unit.** Forge-time evaluation catches this and the unit escalates to
  HOSTED. The escalation is recorded in the cascade plan; it isn't a silent run-time fallback.
- **The hosted API key is missing at run time.** The runtime prompts the user and stores the key in the OS keyring.
  If the worker has no hosted units, the prompt never appears.
- **The build host's OS doesn't match the target.** The Forge doesn't attempt cross-compilation. It hands the build
  script to the user with instructions for running it on a matching machine. This is a known branch of the initial
  forge, not an error condition.
- **The user declines the build prompt.** The Forge skips the build and leaves the source in the Workspace. The user
  can run the build script themselves later, or ask the Forge to retry the build at any point.
- **A reforge would have to change too much.** When the requested change diverges from the original `AUTHORING.md`
  enough that a patch would be messier than a fresh build, the Forge does the fresh build and replaces the Workspace.
  The previous `AUTHORING.md` is preserved in a `history/` subfolder for reference.

### Open questions

These aren't decided yet, mostly because the design doesn't have enough operational experience to commit. Each is
real enough to bite us if we don't pick an answer before the first batch of workers ship.

- **Scheduling across OSes.** Native schedulers — Windows Task Scheduler, launchd, cron — all work differently. Do we
  ship a thin cross-platform scheduler with each worker, or generate native scheduler config at forge time?
- **Worker updates.** A reforge today produces a new artifact the user has to redistribute by hand. Is there a
  lightweight update channel that doesn't require us to run a server?
- **Artifact attestation.** A built `.exe` should be verifiable against the source in the Workspace. What's the
  minimum scheme that gives the recipient confidence without turning the build pipeline into a research project?
- **Local model selection.** Different users have different Ollama models installed. Does the Forge pin a specific
  model per worker, or query the host at run time and pick the best available?

### Future work

Out of scope for this design, listed here so they don't get re-litigated in review:

- A workers marketplace.
- Automated security scanning of generated workers.
- Code-signing.
- A CLI surface for workers.
- An remote update channel.
- A desktop UI for the Forge itself.
- Auto-reforge on failure.
- Artifact attestation.
- Smarter local-model selection.
