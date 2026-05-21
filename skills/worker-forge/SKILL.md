---
name: worker-forge
description: >-
  Use whenever the user wants to turn a small, repetitive desktop task into
  a portable program (a "worker") they can double-click, schedule, or hand
  to someone else. Trigger on phrases like "make me a tool that...",
  "automate this...", "turn this into an .exe / .app / AppImage", "package
  this as a desktop app", "create a worker that...", or "every time X
  happens, do Y". Also trigger when the user describes a small recurring
  chore (renaming files, summarizing PDFs, tracking a webpage, generating
  a digest) and the natural outcome is a standalone program, not a
  one-off answer. Runs the full forge cycle — interview, design a runtime
  cascade (code, then local LLM via Ollama, then hosted LLM), generate a
  worker folder with AUTHORING.md and WORKER.md, and produce a native
  artifact for Windows, macOS, or Linux via PyInstaller. Also handles
  reforge when the user returns with a changed requirement. Prefer over
  ad-hoc scripts when the deliverable is something the user will run
  repeatedly or share.
---

# Worker Forge

Worker Forge turns a plain-language description of a small repetitive task into a self-contained native program — a *worker* — that the user runs on their own machine. This skill is the forge: it interviews the user, designs the worker, writes the source, lays out the worker folder, and builds the artifact.

The product principles to keep in mind throughout:

- **One file at distribution.** The user ends up with one `.exe`, one `.app` bundle, or one AppImage / static binary. No installer, no Python runtime to set up on the recipient's machine.
- **Cheapest tier first, every time.** At run time the worker walks a three-tier cascade: deterministic code, then a local LLM via Ollama, then a hosted LLM. Escalate only when the cheaper tier cannot satisfy the unit. At forge time, do not reach for a model call when a regex will do.
- **The recipient is not the author.** Setup steps, error messages, and outputs must make sense to someone who did not describe the task.
- **Single responsibility per worker.** One worker, one job. If the user asks for two things, that is two workers.
- **Reforgeable.** Every worker carries enough context (`AUTHORING.md` + `WORKER.md`) for a later forge to modify it without starting over.

## The forge cycle

A forge runs in four phases. Don't skip phases — each one feeds the next. The interview is the highest-leverage phase; rushing it produces workers that handle the user's first example and break on everything else.

### Phase 1 — Interview

Read `references/interview.md` and run a critical-journeys interview. Get a description sharp enough that someone else could build the worker from it. Focus questions on the parts of the task that affect correctness — what counts as a duplicate, what should happen on partial failure, where outputs go, what the user wants to see when nothing was found. A vague answer here turns into a vague worker.

Use the `AskUserQuestion` tool. Concrete options beat free-text equivocation.

Ask the user which OS the worker targets. The forge supports Windows, macOS, and Linux, one target per worker. Cross-compilation is not supported; a worker built for Windows is built on Windows. If you don't know the user's OS, ask.

End the interview with a one-paragraph spec you read back to the user. Don't move on until they confirm.

### Phase 2 — Cascade design

Read `references/cascade.md` and lay out the worker's logic as a cascade. Break the task into units of work. For each unit, pick the cheapest mechanism that can satisfy it:

- **CODE** — a deterministic function (regex, parser, HTTP call, file walk, library call).
- **LOCAL** — a small instruction-tuned model running on the user's machine via Ollama.
- **HOSTED** — a frontier model (Anthropic or OpenAI) called with the user's API key.

Most units are CODE. LOCAL is for fuzzy classification, small-input summarization, simple extractions from messy text. HOSTED is for tasks that genuinely need frontier-model judgment.

Write the cascade plan into the worker's `WORKER.md` as a small Markdown table. The user and any future reforge will read it.

### Phase 3 — Code generation

Build the worker as a small Python project under a worker root the user picks. The templates and runtime live in `assets/`:

- `assets/worker_runtime.py` — the cascade runtime. Every worker imports it unchanged.
- `assets/worker_template.py` — the skeleton `main.py`. The forge fills in the task logic.
- `assets/WORKER_template.md` — the worker's plain-language spec (metadata + cascade plan).
- `assets/AUTHORING_template.md` — the rationale layer (interview, decisions, discarded alternatives).
- `assets/README_template.md` — what the recipient sees.
- `assets/build_windows.bat`, `assets/build_macos.sh`, `assets/build_linux.sh` — per-OS build scripts.
- `assets/requirements.txt` — the dependency template.

The worker's `main.py` should:

1. Import `worker_runtime` and instantiate a `Worker` with the cascade plan.
2. Implement each cascade unit as a function — pure-code units stay deterministic; fuzzy units call `worker.call_local()` or `worker.call_hosted()`.
3. Wire the units together inside `Worker.run()`. Use `worker.try_cascade(...)` for any unit that has more than one tier.
4. Call `run_worker(worker)` from `if __name__ == "__main__":`.

The runtime handles first-run setup (Ollama availability check, API-key prompt, keyring storage) automatically — don't reinvent it.

**Use the scaffolder.** Don't copy files by hand. Once you've written the filled-in `main.py` and have the AUTHORING / WORKER / cascade content, invoke the scaffolder:

```bash
python scripts/scaffold_worker.py \
    --name <slug> \
    --description "<one paragraph>" \
    --target-os windows \
    --main <path-to-filled-main.py> \
    --worker-md <path-to-filled-WORKER.md> \
    --authoring-md <path-to-filled-AUTHORING.md> \
    --requirements requests==2.32.3 pypdf==4.3.1 \
    --reads "<what files / URLs it reads>" \
    --writes "<where output goes>" \
    --network "<endpoints touched, or 'None'>" \
    --run-instructions "<one line on how to invoke>" \
    --root <user-chosen-root>
```

The scaffolder writes the worker folder under `<root>/workers/<slug>/` with the layout in the next section. It picks the build script for `--target-os` and copies the runtime unchanged.

### Phase 4 — Packaging

Read `references/packaging.md`. The build step requires the target OS — PyInstaller produces an artifact for the platform it runs on. Cross-compilation is out of scope.

Once the worker folder is scaffolded:

1. **Ask the user for permission to run the build now.** Show them the build command and the target OS.
2. **If they say yes and the host OS matches the target,** run `build/<script>` from the worker folder. The artifact lands in `dist/`. Hand the user a `computer://` link to it.
3. **If the host OS does not match the target,** hand the user the build script with instructions for running it on a matching machine. Tell them what to expect (build time, output path).
4. **If they say no,** leave the source in place. They can run the build script later, or ask the forge to retry.

Walk the user through SmartScreen on Windows / Gatekeeper on macOS the first time they run the artifact. v1 workers are unsigned.

## What you produce

A successful forge lays out one folder under the user's chosen root:

```
<root>/workers/<worker-name>/
├── AUTHORING.md       # interview, decisions, discarded alternatives
├── WORKER.md          # plain-language spec (metadata + cascade plan)
├── main.py            # the worker's task logic
├── worker_runtime.py  # the cascade runtime (boilerplate)
├── requirements.txt
├── resources/         # prompts, schemas, templates, sample inputs
├── build/             # the build script for the target OS
│   └── build.bat      # or build.sh — one script, picked at forge time
├── dist/              # built artifact lands here
│   └── <worker>.exe   # or .app, or AppImage, depending on target OS
└── README.md          # user-facing — what it does, how to run it
```

After the build runs, `dist/<worker>.<ext>` is the artifact the user double-clicks or hands to someone else.

`WORKER.md` is structured like a skill: it starts with a `name` + `description` metadata block and reads as the worker's plain-language entry point. `AUTHORING.md` is the rationale layer. Together they make the worker reforgeable.

## Reforge

Reforging is the common case after the first build. When the user comes back with a changed requirement:

1. Read `AUTHORING.md` and `WORKER.md` from the worker folder.
2. Identify the cascade unit (or units) the change touches.
3. Modify that unit in `main.py`. Update `WORKER.md`'s cascade plan if the tier choice changed.
4. Append the change rationale to `AUTHORING.md` so the next reforge has it.
5. Ask the user for permission to rebuild. If yes and OS matches, run the build script.

For changes large enough that a patch is messier than a redo — the input format changes, the trigger changes, the output shape changes — do a fresh forge. Preserve the previous `AUTHORING.md` under `<worker>/history/` before overwriting.

A worker that can't be reforged from its own `AUTHORING.md` failed Phase 1. If that happens, the fix is in the interview, not in the code.

See `references/reforge.md` for the full flow.

## When to push back

Worker Forge is for small, single-purpose tasks. If the user describes something that looks like a full application — multi-screen UI, user accounts, server backend, real-time streaming, long-running daemon — say so. Either narrow the request to a worker-shaped piece, or tell the user this is not a worker-shaped problem.

If the task is genuinely a one-off ("summarize this one PDF for me"), don't forge a worker — just do the task. The forge is for things the user will run repeatedly or share.

If the task fundamentally requires a server the user does not own (e.g., a webhook receiver, a shared database), it is not a worker. A worker can call APIs, but it cannot be one.

## Common failure modes

- **App-shaped requests.** Narrow or decline. See above.
- **LOCAL unreliable for a unit.** Catch it at forge time by trying a representative input. If LOCAL can't handle it, escalate the unit to HOSTED in the cascade plan. Don't let a run-time discovery be the first signal.
- **Build host doesn't match target.** Known branch, not an error. Hand the user the build script.
- **User declines the build prompt.** Leave the source in place. They can build later.
- **Hosted API key missing at run time.** The runtime prompts the user and stores the key in the OS keyring. If the worker has no hosted units, the prompt never fires.
