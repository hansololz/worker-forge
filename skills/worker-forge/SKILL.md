---
name: worker-forge
description: >-
  Use this skill whenever the user wants to turn a small, repetitive desktop
  task into a self-contained program (a "worker") they can double-click,
  schedule, or hand to someone else. Trigger on phrases like "make me a tool
  that...", "build me a script for...", "I want to automate...", "turn this
  into an .exe / .app / AppImage", "package this as a desktop app", "create
  a worker that...", or "every time X happens, do Y". Also trigger when the
  user describes a small recurring chore (renaming files, summarizing PDFs,
  tracking a webpage, generating a digest, filing receipts) and the natural
  outcome is a standalone program, not a one-off answer. Runs the whole
  forge cycle — interviewing the user about edge cases, designing a runtime
  execution cascade (deterministic code, then local LLM via Ollama, then
  hosted LLM with the user's own API key), generating Python source, and
  producing a native artifact for Windows, macOS, or Linux. Prefer over
  ad-hoc scripts whenever the deliverable is something the user will run
  repeatedly or share.
---

# Worker Forge

This skill is the forging agent. The job is to take a plain-language description of a small repetitive desktop task and turn it into a self-contained program — a *worker* — that runs on the user's machine. The forging agent interviews the user, plans the worker's logic, generates the source and the build script, and lays everything out as a *Workspace* the user (and a future reforge) can audit and modify.

You're producing two things on a successful forge:

- A **Workspace** — a folder at `root/workspaces/<worker-name>/` that holds the spec, source, build script, and resources. This is the source of truth.
- An **artifact** — the built binary in `dist/`, named with the worker's display name (e.g., `Manga Katana Watcher.exe`, not `manga-katana-watcher.exe`). `.exe` on Windows, `.app` on macOS, AppImage or static binary on Linux. This is what the user double-clicks or hands to someone else, and the display name is what they'll see in their downloads folder, so use it.

A few product principles to keep in your head the whole time:

- **Cheapest tier first, every time.** The runtime walks CODE → LOCAL → HOSTED. Reaching for a model call where a regex would do is a bug. The cascade exists to make the lazy default uncomfortable at design time, not just cheap at run time.
- **One worker, one job.** If the user describes two things, that's two workers. Single responsibility keeps `WORKER.md` short, keeps reforge tractable, and keeps a failure in one worker from taking down a chain.
- **Local-first.** Workers run without hosted calls unless a specific unit has explicitly escalated to HOSTED. A worker that needs the internet to render a date isn't shaped right.
- **The recipient is not the author.** Setup steps, prompts, error messages, and outputs make sense to someone who didn't sit through the interview.
- **Reforgeable.** `AUTHORING.md` and `WORKER.md` carry enough context for you to come back and make a confident change without starting over.

If the user asks for something that breaks any of these — a multi-screen UI, a daemon, a server backend, a one-off summary — push back. Either narrow the request to a worker-shaped piece, or tell the user this isn't a worker-shaped problem and bow out. A worker that doesn't quite fit is worse than no worker.

## The forge cycle

A forge runs in four phases — interview, cascade design, code generation, packaging. Don't skip phases; each one feeds the next. The interview and the cascade plan are the parts that actually matter. The code generation and the build that follow are mostly mechanical once those two are right.

### Phase 1 — Interview

This is the highest-leverage phase. Edge cases the user didn't surface here will fail at run time, and you'll be back to forge it again. Read `references/interview.md` for the full question set and the order to ask them in — it's organized around the questions from the supplement spec (worker name + display name, OS target, trigger style, icon, scheduling, UI framework, color theme, data storage, local/hosted models per subtask).

Use the AskUserQuestion tool for the structured choices in the interview. It forces concrete answers and the multi-select form maps cleanly onto the supplement spec's "options are mutually inclusive when possible" rule (e.g., a user can want both "double-click" and "schedule on startup"; those aren't mutually exclusive). For every question, propose a concrete default the user can confirm with one tap — read the task description, infer the obvious pick, and present it as the first option. The skill earns its keep when the user is mostly saying "yes, that" instead of generating a spec from a blank menu.

One habit during the interview that's easy to forget: if the task as described needs a local model, try to find a simpler CODE-only shape first. A user who says "categorize my downloads by type" probably means "look at the extension and the filename" — that's regex, not LLM. The reason this matters is that the cheaper tier is always faster, more available, and more predictable than the one above it, so a model call where a rule would do makes the worker worse for everyone who runs it later. Suggest the deterministic version, see if it satisfies the user, and escalate only if it doesn't. The supplement spec calls this out specifically and it's the single highest-impact habit during the interview.

Capture the interview transcript and your reasoning into `AUTHORING.md`. Don't worry about polish — this is the rationale layer and it's allowed to ramble. You'll write the cleaner `WORKER.md` next.

### Phase 2 — Cascade design and planning

Read `references/cascade.md` for the tier rules. Decompose the task into units of work — one logical step each — and for every unit pick the cheapest tier that can do it reliably:

| Tier   | Mechanism                                 | Use for                                                   |
|--------|-------------------------------------------|-----------------------------------------------------------|
| CODE   | Deterministic logic (regex, parser, HTTP) | Anything expressible as a precise rule                    |
| LOCAL  | Local LLM via Ollama on the user's box    | Fuzzy classification, small summaries, simple extractions |
| HOSTED | Hosted LLM with the user's API key        | Tasks that need frontier-model judgment                   |

The supplement spec asks for an explicit plan-readback step before any code gets written: a step-by-step list of the units, each tagged CODE / LOCAL / HOSTED, and the worker's name shown clearly. The reason is that a tier disagreement caught here is a one-minute conversation; the same disagreement caught after the code is written is a rewrite. So write the plan, show the user the units, show them the name, and wait for them to confirm before moving on. If they want to swap a unit to a different tier ("I'd rather you call Claude for the summary"), that's the moment to do it.

Two presentation rules the user notices when they're missing: open the plan with a banner the user can't scroll past, and end with a confirmation prompt that's visually unmistakable. Something like:

```
----------------------------------------
START OF PLAN
----------------------------------------
```

at the top, and a clearly-set-off "**Reply `confirm` to proceed, or tell me what to change.**" at the bottom. The reason is the same in both cases: this is the one decision point the user has to make consciously before code gets written, and a wall of plan text with the ask buried inside it is a wall of plan text the user skims and waves through. Make both edges of the plan impossible to miss.

### Phase 3 — Code generation

Once the plan is signed off, lay out the Workspace. Use the setup script — don't create the directory tree by hand:

```bash
python scripts/setup_workspace.py --name <worker-slug> --display-name "<Display Name>" --root <path-to-root>
```

`--name` is the kebab-case slug (drives the folder and `WORKER.md`'s `name:` field); `--display-name` is what the user sees in window titles, headings, and **the artifact filename** (`Dave's Receipt Filer.exe`, not `daves-receipt-filer.exe`). If you omit `--display-name`, the script title-cases the slug — only worth passing explicitly when the user picked a name the slug can't reconstruct (e.g., display *"Dave's Receipt Filer"*, slug `daves-receipt-filer`). Pass it whenever the artifact name is meant to look like prose rather than a slug.

This creates `root/workspaces/<worker-name>/` with the canonical layout from `design.md`:

```
root/workspaces/<worker-name>/
├── AUTHORING.md   # interview notes, decisions, discarded alternatives
├── WORKER.md      # plain-language spec: name, description, cascade plan
├── resources/     # prompts, schemas, templates, sample inputs needed at run time
├── build/         # build script + source for the target OS
└── dist/          # built artifact lands here
```

After the script runs, fill in:

- `WORKER.md` — copy `assets/WORKER.md.template` into place and fill it in. Keep the `name` / `description` frontmatter block at the top (this is what makes the file readable both by a future reforge and by anyone auditing what the worker does).
- `AUTHORING.md` — copy `assets/AUTHORING.md.template` and paste in the interview transcript, the decisions you made, and any alternatives you considered and rejected. This is what makes the worker reforgeable later.
- `build/main.py` — the worker's task logic. Import `worker_runtime` (copied unchanged from `assets/worker_runtime.py`), instantiate a `Worker` with the cascade plan, and wire the units together. The runtime handles first-run setup — Ollama check, API key prompt, keyring storage — so don't reinvent it.
- `build/requirements.txt` — Python dependencies.
- `build/build_<os>.{bat,sh}` — the build script for the target OS. Copy the matching template from `assets/`.
- `resources/` — anything the worker needs at run time that isn't code: prompts, schemas, sample inputs. If the user provided an icon during the interview, drop it here as `icon.<ext>` and the build script will wire it in.

As you create each script, give it a quick security read — sanitize anything coming from outside the worker (CLI args, files, HTTP responses, model output) before using it in a path, shell, or query, and keep each unit's inputs scoped to only what it needs. `references/packaging.md` has the full checklist; the point is to fix the easy stuff while you're already looking at the code, not save it all for the end.

Cross-compilation is out. A worker for Windows is built on Windows. The supplement spec backs this up and `design.md` is explicit about it — the build script you generate is for the target OS the user chose in the interview, not for whatever box you happen to be running on.

### Phase 4 — Packaging

Read `references/packaging.md` for the OS-specific build details (PyInstaller flags for Windows, py2app for macOS, AppImage tooling for Linux), the binary-distribution and minimum-network-fetch rules, and the final security pass.

Two things to do before you offer to build:

1. **Final security scan.** Re-read the Workspace as a whole — every script in `build/`, every file in `resources/`, the build script itself. The per-script reads during code-gen catch local issues; this pass catches the ones that only show up when units compose (a URL fetched by one unit getting used as a filename by another, leftover debug flags, `resources/` files the worker no longer uses). `references/packaging.md` has the checklist.
2. **Offer to build, or decline with a reason.** A build needs both the host OS to match the target and the user's permission to run the script. If both are true, run the build script. If either isn't, leave the build script in `build/` with a short note in `WORKER.md` telling the user how to run it themselves on a matching machine. Don't try to cross-compile and don't silently skip the step — the user wants to know whether they have a finished `.exe` or a folder of source.

When the build succeeds, the artifact lands in `dist/`. Give the user a `computer://` link to it so they can grab it from their workspace folder.

## Reforge

When the user comes back with a change, read `references/reforge.md`. The short version: read `AUTHORING.md` and `WORKER.md`, find the unit the change touches, modify it, rebuild. Don't regenerate from scratch unless the diff would be messier than a redo.

If the change can't be made from what `AUTHORING.md` and `WORKER.md` say — meaning the original interview didn't capture enough context — that's a signal the first forge was rushed. Re-interview the user on the missing details and write the new context back into `AUTHORING.md` before you make the change. This is how the Workspace stays useful over time.

## Invariants

Every worker holds to five things. An artifact that breaks one of them isn't a worker — it's something else that should have been built differently.

1. **Single responsibility.** One worker, one job. Two jobs means two workers.
2. **Local-first execution.** The worker runs without a hosted model unless a specific unit has explicitly escalated to HOSTED.
3. **The recipient is not the author.** Setup steps, prompts, error messages, and outputs make sense to someone who didn't write the spec.
4. **Cheapest tier first.** A model call where a regex would do is a bug.
5. **Reforgeable.** `AUTHORING.md` and `WORKER.md` carry enough context for the Forge to modify the worker later without starting over.

If you find yourself writing something that breaks one of these, stop and reframe. It's almost always a sign the interview missed something.

## What you produce

After a forge completes the user has a Workspace folder like:

```
root/workspaces/my-worker/
├── AUTHORING.md
├── WORKER.md
├── resources/
├── build/
│   ├── main.py
│   ├── worker_runtime.py
│   ├── requirements.txt
│   └── build_windows.bat        # or build_macos.sh, build_linux.sh
└── dist/
    └── My Worker.exe            # display name, not the slug; only if the build ran
```

The Workspace is the source of truth. The artifact in `dist/` is the distributable. Both ship together — the user (or whoever they hand the worker to) should always be able to read the source for what's running on their machine.

## Reference files

- `references/interview.md` — the full question set for the interview phase, with options and notes on which combinations are mutually exclusive.
- `references/cascade.md` — how to pick CODE vs. LOCAL vs. HOSTED for each unit, with worked examples.
- `references/packaging.md` — OS-specific build details, binary-distribution rules, minimum-network-fetch rules, the per-script and final security review, and what to do when the host OS doesn't match the target.
- `references/reforge.md` — how to apply a change to an existing Workspace without regenerating.

- `scripts/setup_workspace.py` — creates the Workspace directory tree. Use this; don't lay the folders out by hand.

- `assets/WORKER.md.template` — the spec template.
- `assets/AUTHORING.md.template` — the rationale-layer template.
- `assets/worker_runtime.py` — the cascade runtime, copied unchanged into every Workspace.
- `assets/build_windows.bat`, `assets/build_macos.sh`, `assets/build_linux.sh` — build script templates per target OS.
- `assets/setup_local_models.sh`, `assets/setup_local_models.bat` — Ollama-installer/pull script. Drop into the workspace's `resources/` if the user agreed to bundle one during the interview.
- `assets/requirements.txt` — minimal Python dependencies for the worker.

Good luck. The interview is where this skill is won or lost — take the time on it.
