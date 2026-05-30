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
- **Native per-OS builds.** A worker is built for the OS the Forge is running on and ships as that platform's native
  artifact. macOS and Windows are supported today; Linux is planned. There's no cross-compilation — putting the same
  worker on a second OS means re-running the Forge on a machine of that OS (see "The target OS is the host OS").

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
├── README.md             # front-door doc: blurb, ordered features, per-OS build + run commands
├── AUTHORING.md          # interview transcript, decisions, discarded alternatives — OS-agnostic
├── WORKER.md             # plain-language spec: name, description, cascade plan — OS-agnostic
└── <os>/                 # windows/ or mac/ — the OS this forge ran on (linux/ is future work)
    ├── <os>-specific.md  # interview answers tied to this OS (UI framework, data path, keychain)
    ├── main.py           # worker task logic
    ├── worker_runtime.py # the cascade runtime, copied unchanged
    ├── requirements.txt
    ├── build_<os>.{bat,sh}
    ├── resources/        # prompts, schemas, icons, scheduler glue, sample inputs
    └── dist/             # built artifact lands here, named with the display name
```

The layout is split deliberately. `WORKER.md` and `AUTHORING.md` hold everything true of the worker *regardless of
OS* — `WORKER.md` is structured like a Claude skill (a `name` / `description` metadata block up top, then what the
worker does and its cascade plan, the clean spec the user reads), and `AUTHORING.md` is the interview transcript, the
decisions, and the discarded alternatives. Anything tied to a specific OS — which UI framework, where data lives,
which keychain, the scheduler glue, packaging caveats — drops one level down into `<os>/<os>-specific.md`. `README.md`
is the short front-door blurb plus the copy-pasteable build-and-run commands. Because the OS-specific answers live in
their own folder, building the same worker on a second OS later adds a sibling `<os>/` folder beside the first without
touching it: the common files are read straight back and only the OS-specific handful gets re-asked (see Reforge). The
Forge uses these files to reason about the worker, and the Workspace — not the binary — is the source of truth.

**Worker Forge** is the agent that produces and edits Workspaces. On a new build it runs four phases:

1. **Interview.** Pin down the task, edge cases, failure handling, output location, what counts as success. This
   is the highest-leverage phase — edge cases not surfaced here will fail at run time.
2. **Cascade design.** Decompose the task into units of work. For each unit, the Forge tries CODE first — a regex,
   parser, or HTTP call that does the job deterministically. Only if no deterministic option fits does it fall back to
   LOCAL (a local LLM via Ollama). Only if LOCAL can't reliably handle the unit does it escalate to HOSTED (a frontier
   model called with the user's own API key). The cheaper tier is always faster, more available, and more predictable
   than the one above it, so escalating without cause makes the worker worse at run time. Examples: parsing a date out
   of a filename is CODE; classifying a document as "invoice" vs. "receipt" is LOCAL; summarizing a fifty-page
   contract well is HOSTED. For a HOSTED unit the plan records a specific provider *and* model (the cheapest-tier-first
   instinct keeps going inside HOSTED — balanced model by default, top tier only when the unit needs frontier
   judgment), not just the word "HOSTED". The chosen tier for each unit lands in `WORKER.md` so a later reforge can see
   what was decided.

   | Tier   | Mechanism                                 | Use for                                                   |
      |--------|-------------------------------------------|-----------------------------------------------------------|
   | CODE   | Deterministic logic (regex, parser, HTTP) | Anything expressible as a precise rule                    |
   | LOCAL  | Local LLM via Ollama on the user's box    | Fuzzy classification, small summaries, simple extractions |
   | HOSTED | Hosted LLM with the user's API key        | Tasks that need frontier-model judgment                   |

3. **Code generation.** Lay out the Workspace with the setup script — it auto-detects the host OS and creates the
   matching `<os>/` folder — then fill in the spec files, instantiate the runtime, and wire the units together. A
   worker with a GUI gets the default light theme and a native UI framework rather than bare Tkinter.
4. **Packaging.** Build for the host OS — there is no target other than the host. The Forge does a final security pass
   over the OS folder, writes the workspace `README.md`, then asks permission and runs `build_<os>.{bat,sh}` itself,
   producing a single self-contained binary (PyInstaller `--onefile` or the py2app equivalent) so the recipient needs
   no Python, and smoke-tests it before handing it over. If it can't run the build from inside the session — a missing
   toolchain, a credential only the user has, an interactive prompt it can't satisfy — it doesn't go quiet: it hands
   the user the exact command, the working directory, and where the artifact will land. The output is the artifact in
   `<os>/dist/`, named with the display name.

When the user comes back with a change, the Forge **reforges**: it reads `AUTHORING.md`, `WORKER.md`, and the relevant
`<os>-specific.md`, modifies the affected unit, keeps the docs in sync, and rebuilds. A second, common flavor is
building the same worker on a new OS — the behavior is already captured in the common files, so the Forge re-asks only
the OS-specific questions and adds a sibling `<os>/` folder. Full regeneration is reserved for changes large enough
that a patch would be messier than a redo.

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
        build can run here              can't run here (missing
        (host = target OS)              toolchain / credential /
                │                       interactive prompt)
                ▼                                   │
       Forge runs build script                     ▼
       + smoke-tests artifact          Forge hands user the exact
                │                       command + working directory
                └─────────────────┬─────────────────┘
                                  ▼
                <os>/dist/<Display Name>.<os-extension>  (the artifact)
```

The interview and the cascade plan are the parts of the forge that actually matter; the code generation and build
that follow are mostly mechanical once those two are right. The Forge always builds for the host OS, so there's no
cross-compilation branch; the only place the initial forge can stall is when the build can't be run from inside the
session — a missing toolchain, a credential only the user has — and it stalls into a clean handoff rather than a
failure: the user gets the exact command and the working directory and runs it themselves.

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
user double-clicks or the scheduler invokes. The cascade runtime walks the units in the order the Forge planned them,
and each unit runs at the tier the plan assigned it — the runtime does **not** silently escalate a struggling unit to
a higher tier. Tier choice is a forge-time decision baked into the plan: if LOCAL wasn't good enough for a unit, that
was caught and fixed when the worker was forged, not papered over at run time. The one exception is a unit whose input
genuinely varies in shape (clean PDF vs. photo), which the Forge wires with an explicit, opt-in `fallback=` and names
both paths in the plan. Because the tiers are pinned this way, a worker with no hosted unit keeps running fully
offline. The hosted tier prompts for the user's API key on first need and stores it in the OS keyring; the user can
also provide keys ahead of time so the prompt never appears, and if the worker has no hosted units the prompt never
appears at all.

#### Reforge

```
user (change request) ──▶ Worker Forge
                              │
                              ▼
           reads AUTHORING.md + WORKER.md + <os>-specific.md
                              │
                              ▼
                 modifies affected cascade unit
                              │
                              ▼
                rebuilds artifact in <os>/dist/
```

Reforge is the common case after the first build, and it's the test the Workspace has to pass: if the Forge
can't reconstruct enough context from `AUTHORING.md`, `WORKER.md`, and the relevant `<os>-specific.md` to make a
confident change, the original interview failed. Most reforges touch one unit and rebuild. A distinct flavor is
building the same worker on a new OS, where the Forge re-asks only the OS-specific questions and adds a sibling
`<os>/` folder beside the existing one. Full regeneration is reserved for changes large enough that a patch would be
messier than a redo.

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
black box the next maintainer can't reason about. The artifact in `<os>/dist/` is the distributable; the Workspace is
the source of truth.

#### The target OS is the host OS

The Forge doesn't ask which OS to target — it detects the OS it's running on and builds for that one, full stop. A
worker for Windows is built on Windows; a worker for macOS is built on a Mac. There's no cross-compilation. This
trades convenience for predictability — cross-compilation introduces a class of "works on my machine" bugs that are
hard to catch and harder to debug from inside a Forge run. When the user wants the same worker on a second OS, they
re-run the Forge on a machine of that OS and it adds a sibling `<os>/` folder to the existing Workspace, reusing the
common spec and re-asking only the OS-specific questions. macOS and Windows are supported today; Linux scaffolding
(the `linux/` folder logic, `build_linux.sh`, the Linux templates) is present but the toolchain hasn't shipped, so a
forge on a Linux host stops before the interview and tells the user Linux isn't supported yet.

### Failure modes

The Forge expects to hit each of these. Anything not on this list and not handled inline in the run or forge code is
a bug worth investigating.

- **The request isn't worker-shaped.** The user describes a multi-screen UI, a server, or a long-running service. The
  Forge pushes back, offers to narrow the request to a worker-shaped piece, or declines.
- **The LOCAL tier isn't reliable enough for a unit.** Forge-time evaluation catches this and the unit escalates to
  HOSTED. The escalation is recorded in the cascade plan; it isn't a silent run-time fallback.
- **The hosted API key is missing at run time.** The runtime prompts the user and stores the key in the OS keyring.
  If the worker has no hosted units, the prompt never appears.
- **The build can't run from inside the forge session.** The sandbox is missing a toolchain (`pyinstaller`, `npm`),
  the build needs a credential only the user has, or it requires an interactive prompt the agent can't satisfy. The
  Forge doesn't go quiet — it hands the user the exact command, the working directory, and where the artifact will
  land. This is a known branch of the initial forge, not an error condition.
- **The forge is running on Linux.** Linux isn't supported yet. The Forge stops before the interview and tells the
  user they'd need a Mac or Windows machine to forge a worker today; Linux support is on the roadmap.
- **The user declines the build prompt.** The Forge skips the build and leaves the source in the Workspace. The user
  can run the build script themselves later, or ask the Forge to retry the build at any point.
- **A reforge would have to change too much.** When the requested change diverges from the original `AUTHORING.md`
  enough that a patch would be messier than a fresh build, the Forge does the fresh build and replaces the Workspace.
  The previous `AUTHORING.md` is preserved in a `history/` subfolder for reference.

### Open questions

These aren't decided yet, mostly because the design doesn't have enough operational experience to commit. Each is
real enough to bite us if we don't pick an answer before the first batch of workers ship.

- **Worker updates.** A reforge today produces a new artifact the user has to redistribute by hand. Is there a
  lightweight update channel that doesn't require us to run a server?
- **Artifact attestation.** A built `.exe` should be verifiable against the source in the Workspace. What's the
  minimum scheme that gives the recipient confidence without turning the build pipeline into a research project?

Two questions from the original design have since been settled by the skill and are no longer open: scheduling is
generated as **native config at forge time** (launchd `.plist`, Task Scheduler XML, `.desktop` autostart written into
`<os>/resources/`), and local-model selection **pins a specific model per worker** at forge time (`llama3.2:3b` by
default, recorded in the cascade plan and `<os>-specific.md`), with the user free to override.

### Future work

Out of scope for this design, listed here so they don't get re-litigated in review:

- A workers marketplace.
- Automated security scanning of generated workers. (The Forge already does a manual security pass at code-gen and
  before handoff; automating it is the future-work item.)
- Code-signing.
- A remote update channel.
- A desktop UI for the Forge itself.
- Auto-reforge on failure.
- Artifact attestation.
- Smarter local-model selection.
