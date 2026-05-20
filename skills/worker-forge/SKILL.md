---
name: worker-forge
description: Use this skill whenever the user wants to turn a small, repetitive desktop task into a portable program — a "worker" — that they can double-click, schedule, or hand to someone else. Trigger on phrases like "make me a tool that...", "build me a script for...", "I want to automate...", "turn this into an .exe", "package this as a desktop app", "create a worker that...", "every time X happens do Y", or "I do this every week, can you just...". Also trigger when the user describes a small recurring chore (renaming files, summarizing PDFs, watching a webpage, building a digest, batch downloads, email triage, scraping a feed) and the natural outcome is a standalone program rather than a one-off answer. Runs the full forge cycle — interview, cascade design, code generation, packaging — and writes the result into the user's Workshop. Workers walk a CODE → LOCAL → HOSTED cascade at run time so they stay cheap and local-first. Targets Windows, macOS, and Linux. Prefer this skill over ad-hoc scripts whenever the deliverable is something the user will run more than once or share with someone else.
---

# Worker Forge

Worker Forge turns a plain-language task into a portable program — a *worker* — that runs locally without an ongoing
subscription. This skill is the forging agent. It interviews the user, designs the worker, writes the code, and packages
the artifact into the user's Workshop.

The full product vocabulary (Worker, Workshop, cascade) is in `references/concepts.md`. Read it first if any of those
terms is new.

## Product principles

These hold for every worker. Violate them and the artifact isn't a worker — it's something else.

- **One worker, one job.** Two jobs means two workers. Workers don't compose by sharing code; they compose by being
  chained externally (cron, another worker, the user).
- **Local-first.** Workers run without an internet connection unless a unit has explicitly escalated to the hosted tier.
- **Cheapest tier first.** A model call where a regex works is a bug. A hosted call where a local model works is a bug.
- **The recipient is not the author.** Setup prompts, error messages, and outputs make sense to someone who didn't
  describe the task.
- **Reforgeable.** `WORKER.md` and `AUTHORING.md` carry enough context that a future forge can change the worker without
  starting from scratch.

The "why" behind each principle is in `references/concepts.md`. Don't skip them — they're the difference between a
worker and a one-off script.

## The forge cycle

Four phases, in order. Each one feeds the next. The interview is the highest-leverage phase; a vague spec produces a
worker that passes the user's first example and breaks on everything else.

### Phase 1 — Interview

Read `references/interview.md` and run the critical-journeys interview. Use `AskUserQuestion` for finite choices (target
OS, trigger, error behavior) — free text invites equivocation on questions where you need a concrete pick.

Cover at minimum:

- **Target OS.** Windows, macOS, or Linux. This decides the build script and the artifact extension.
- **Trigger.** Click, schedule, cron, or event. See `references/concepts.md` for what each means.
- **Input.** What the worker reads, and from where.
- **Output.** What the worker writes, and where.
- **Edge cases.** Duplicates, partial failure, empty input, ambiguity. Two probes minimum.
- **Inference budget.** Local-only, willing-to-pay-for-hosted, or no-AI-needed.

End the interview with a one-paragraph spec read back to the user. Don't move on until they confirm.

### Phase 2 — Cascade design

Read `references/cascade.md`. Decompose the task into units of work. For each unit, pick the cheapest tier that does the
job:

- **CODE** — deterministic Python (regex, parser, HTTP, library call).
- **LOCAL** — local LLM via Ollama on the user's machine.
- **HOSTED** — frontier model with the user's own API key.

Most units are CODE. Write the cascade plan as the body of `WORKER.md` — a plain-language spec the user (or a future
reforge) can read at a glance.

### Phase 3 — Code generation

Build the worker as a small Python project rooted inside the user's Workshop at `workshop/workers/<worker-name>/`.
Templates live in `assets/`:

- `assets/worker_runtime.py` — the cascade runtime. Every worker imports it unchanged.
- `assets/main_template.py` — the `main.py` skeleton.
- `assets/WORKER_template.md` — the `WORKER.md` skeleton (skill-style metadata + cascade plan).
- `assets/AUTHORING_template.md` — the `AUTHORING.md` skeleton (interview, decisions, alternatives).
- `assets/build_windows.bat`, `assets/build_macos.sh`, `assets/build_linux.sh` — per-OS build scripts.

`main.py` should:

1. Import `worker_runtime` and instantiate a `Worker` with the worker's name.
2. Implement each cascade unit as a function (CODE) or as a callable that delegates to `worker.call_local()` /
   `worker.call_hosted()`.
3. Wire units together inside `run()`, using `worker.try_cascade(...)` for any unit with multiple tiers.
4. Call `run_worker(worker)` from `if __name__ == "__main__":`.

The runtime handles first-run setup (Ollama check, API key prompt, config persistence) on its own. Don't reinvent it.

Use the scaffolder rather than copying files by hand:

```bash
python scripts/scaffold_worker.py \
    --name <slug> \
    --description "<one paragraph>" \
    --target-os <windows|macos|linux> \
    --trigger <click|schedule|cron|event> \
    --workshop <path-to-workshop> \
    --main <path-to-filled-main.py> \
    --worker-md <path-to-filled-WORKER.md> \
    --authoring-md <path-to-filled-AUTHORING.md> \
    --requirements requests==2.32.3 pypdf==4.3.1 \
    --reads "<files/URLs read>" \
    --writes "<where output goes>" \
    --network "<endpoints touched, or 'None'>"
```

The scaffolder lays out `workshop/workers/<slug>/` with `main.py`, `worker_runtime.py`, `WORKER.md`, `AUTHORING.md`,
`requirements.txt`, the matching `build/` script, an empty `resources/`, and an empty `dist/`. One worker per folder.

### Phase 4 — Packaging

Read `references/packaging.md`. PyInstaller can't cross-compile, so the build needs to happen on a machine matching the
target OS.

**Always ask the user before invoking a build.** Builds take a minute or two and pull dependencies — don't surprise the
user. After confirmation, branch on whether the host OS matches the target:

- **Host OS matches target.** Run the build script yourself. Stream the output. On success, hand the user a
  `computer://` link to `dist/<worker>.<ext>`.
- **Host OS doesn't match.** Don't try to cross-compile. Hand the user the build script with one-line instructions for
  running it on a matching machine. Tell them where the artifact will land.
- **User declines the build.** Leave the source in the Workshop. Tell them they can run the build script themselves, or
  come back and ask the Forge to retry.

## The Workshop

The Workshop is the persistent directory holding the user's workers. One per user. Default location is
`~/worker-forge-workshop/`. If the user doesn't have one yet, create it on first use and confirm the path.

Layout:

```
workshop/
├── workers/
│   ├── <worker-name>/
│   │   ├── WORKER.md        # skill-style metadata + cascade plan
│   │   ├── AUTHORING.md     # interview notes, decisions, alternatives
│   │   ├── main.py          # task logic
│   │   ├── worker_runtime.py
│   │   ├── requirements.txt
│   │   ├── resources/       # prompts, schemas, sample inputs
│   │   ├── build/           # build script for the target OS
│   │   └── dist/            # built artifact (created by the build step)
│   └── ...
└── forge/                   # shared templates, caches (managed by the Forge)
```

`WORKER.md` is the worker's plain-language spec. It opens with a YAML frontmatter block (`name`, `description`) the way
a Claude skill does, and the body is the cascade plan. `AUTHORING.md` is the rationale layer — the interview, decisions,
and alternatives considered. The two files together let a future reforge reason about the worker without code
archaeology.

## When to push back

Worker Forge is for small, single-purpose tasks. Push back when the user describes:

- **A multi-screen UI, a server, or user accounts.** That's an app, not a worker. Offer to narrow to one piece you can
  ship, or decline.
- **A long-running service or stream.** A worker runs and exits. Daemons don't fit.
- **A one-off task** like "summarize this one PDF for me." Just do the task — don't forge a worker for something that
  runs once.

Better to push back early than to ship something that doesn't deliver.

## Reforge

If the user returns with an existing worker folder and a change request, this is a reforge — not a fresh forge. Read
`references/reforge.md`. In short:

1. Read `WORKER.md` and `AUTHORING.md` to load context. Don't re-interview from scratch.
2. Identify the affected cascade unit. Modify it.
3. Update `WORKER.md` if the cascade changed; append a decision note to `AUTHORING.md` either way.
4. Phase 4 again — ask, build if host matches target, otherwise hand off.

Full regeneration is reserved for changes large enough that a patch is messier than a redo. In that case, archive the
previous folder under `workshop/workers/<name>/history/<timestamp>/` and run a fresh forge.
