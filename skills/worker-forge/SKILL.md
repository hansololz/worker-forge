---
name: worker-forge
description: Turn a repetitive desktop task into a self-contained 'worker' program — interview, plan, build.
---

# Worker Forge

This skill is the forging agent. The job is to take a plain-language description of a small repetitive desktop task and turn it into a self-contained program — a *worker* — that runs on the user's machine. The forging agent interviews the user, plans the worker's logic, generates the source and the build script, and lays everything out as a *Workspace* the user (and a future reforge) can audit and modify.

You're producing two things on a successful forge:

- A **Workspace** — a folder at `root/workspaces/<worker-name>/` that holds the spec, source, build script, and resources. `WORKER.md` and `AUTHORING.md` live at the workspace root and describe everything that's true of the worker regardless of OS. The actual source, build script, resources, and built artifact live one level down inside an OS-specific folder (`windows/`, `mac/`, or `linux/`) so a future rebuild for a different OS slots in next to the first without disturbing it. The Workspace is the source of truth.
- An **artifact** — the built binary in `<os>/dist/`, named with the worker's display name (e.g., `Manga Katana Watcher.exe`, not `manga-katana-watcher.exe`). `.exe` on Windows, `.app` on macOS, AppImage or static binary on Linux. This is what the user double-clicks or hands to someone else, and the display name is what they'll see in their downloads folder, so use it.

A forge run only ever targets the OS the skill is running on — there's no cross-compilation, and no question to the user about which OS to target. If they want the worker on a second OS later, they run the forge again on that machine and the skill adds a new OS folder to the same Workspace (see Reforge below).

## Platform support

Right now the forge supports **macOS and Windows only.** Linux support is planned for a future release but isn't available yet. Because a forge always builds for the OS it's running on, this means:

- On macOS or Windows, proceed normally.
- On Linux, **stop before the interview** and tell the user plainly that Linux isn't supported yet — Linux is on the roadmap but the toolchain (the AppImage/build path, the native GTK/Qt UI, the keychain glue) hasn't shipped. Don't run the forge on a Linux host even though Linux scaffolding (`linux/` folders, `build_linux.sh`, the Linux templates) is present in the skill — that scaffolding is groundwork for the future release, not a signal that Linux is ready. If the user only has a Linux machine, let them know they'd need a Mac or Windows box to forge a worker today, and that Linux support is coming.

The Linux references that remain throughout this skill and its reference files describe where Linux *will* slot in once it's supported; treat them as forward-looking, not as a current target.

A few product principles to keep in your head the whole time:

- **Cheapest tier first, every time.** The runtime walks CODE → LOCAL → HOSTED. Reaching for a model call where a regex would do is a bug. The cascade exists to make the lazy default uncomfortable at design time, not just cheap at run time.
- **One worker, one job.** If the user describes two things, that's two workers. Single responsibility keeps `WORKER.md` short, keeps reforge tractable, and keeps a failure in one worker from taking down a chain.
- **Local-first.** Workers run without hosted calls unless a specific unit has explicitly escalated to HOSTED. A worker that needs the internet to render a date isn't shaped right.
- **The recipient is not the author.** Setup steps, prompts, error messages, and outputs make sense to someone who didn't sit through the interview.
- **Reforgeable.** `AUTHORING.md` and `WORKER.md` carry enough context for you to come back and make a confident change without starting over.

If the user asks for something that breaks any of these — a multi-screen UI, a daemon, a server backend, a one-off summary — push back. Either narrow the request to a worker-shaped piece, or tell the user this isn't a worker-shaped problem and bow out. A worker that doesn't quite fit is worse than no worker.

## The forge cycle

A forge runs in four phases — interview, cascade design, code generation, packaging. Don't skip phases; each one feeds the next. The interview and the cascade plan are the parts that actually matter. The code generation and the build that follow are mostly mechanical once those two are right.

**Keep a progress checklist visible in chat the whole way through.** A forge runs long and across several back-and-forths, and a user who's lost the thread can't tell whether you're stuck, waiting on them, or nearly done. So post this checklist once near the top — right after you've restated the task — and re-post the updated copy at each phase boundary, with finished items checked (`[x]`) and the current one flagged. It's a companion that orients the user, not a gate that blocks them; the plan sign-off and the build keep their own explicit confirmation steps, and this sits above them as the running map.

```
Forge progress
- [ ] Task restated and confirmed
- [ ] CODE-first shapes explored before LOCAL/HOSTED
- [ ] Interview decisions captured
- [ ] Cascade plan signed off
- [ ] Workspace scaffolded and spec docs written
- [ ] Code generated and security-read
- [ ] Final security scan + README written
- [ ] Built (or build commands handed off) + smoke-tested
- [ ] Artifact handed over
```

The lines track the four phases, with the two highest-leverage interview habits (restate-and-confirm, CODE-first) pulled out as their own items because they're the ones most worth showing the user you didn't skip. Phase 4 is three lines on purpose: the final whole-folder security scan is distinct from the per-script reads during code-gen; the workspace README (build + run commands) is a real deliverable; and the build line covers the documented branch where you can't build in-session and hand off the exact commands instead — that's progress, not a stall, so check it rather than leaving the user wondering. Only show milestones that mean something to the user — don't narrate every internal step. On a reforge, run a trimmed version: drop "Workspace scaffolded" and keep the rest.

### Phase 1 — Interview

This is the highest-leverage phase. Edge cases the user didn't surface here will fail at run time, and you'll be back to forge it again. Read `references/interview.md` for the full question set and the order to ask them in — it's organized around the questions from the skill spec (worker name + display name, trigger style, icon, scheduling, UI framework, color theme, data storage, local/hosted models per subtask). The target OS is *not* a question — the skill builds for whatever OS it's running on (currently macOS or Windows; see Platform support above) and records that decision automatically.

Use the AskUserQuestion tool for the structured choices in the interview. It forces concrete answers and the multi-select form maps cleanly onto the skill spec's "options are mutually inclusive when possible" rule (e.g., a user can want both "double-click" and "schedule on startup"; those aren't mutually exclusive). For every question, propose a concrete default the user can confirm with one tap — read the task description, infer the obvious pick, and present it as the first option. The skill earns its keep when the user is mostly saying "yes, that" instead of generating a spec from a blank menu.

Three rules make those choices easy, and they apply to every structured question without exception — `references/interview.md` carries the per-question rationales, but hold the shape in your head as you go:

- **Always make a recommendation, and put it first marked `(recommended)`.** Name the option you'd pick, mark it recommended, and lead with it — the user reads top-down, so the recommended pick should be the first thing they see and the rest of the list reads as "or, if not that, here's why you'd deviate." A question that hands back a blank menu hands the user the decision work they came here to offload — the whole point is that they're reacting to a guess, not generating a spec.
- **Keep the list short — five options at most.** If a question has more candidates than that, show only the handful worth considering for *this* worker and fold the rest into one USER_PROVIDE escape hatch. A wall of options causes the same decision fatigue as a blank menu.
- **Give every option a one-line rationale.** Each choice in an AskUserQuestion carries a short "when you'd pick this" so the user can tell the options apart at a glance — `SQLite` → *"queryable or relational data you'll filter later"*, `JSON` → *"small structured state like a last-seen timestamp"*, `text file` → *"append-only logs, one line per run"*. One clause, not a tutorial; the goal is fast recognition. Bare labels like "SQLite / JSON / text file" force the user to either already know the trade-off or stop and ask — both of which defeat the purpose of the interview.

One habit during the interview that's easy to forget: if the task as described needs a local model, try to find a simpler CODE-only shape first. A user who says "categorize my downloads by type" probably means "look at the extension and the filename" — that's regex, not LLM. The reason this matters is that the cheaper tier is always faster, more available, and more predictable than the one above it, so a model call where a rule would do makes the worker worse for everyone who runs it later. Suggest the deterministic version, see if it satisfies the user, and escalate only if it doesn't. The skill spec calls this out specifically and it's the single highest-impact habit during the interview.

Capture the interview transcript and your reasoning into `AUTHORING.md` for anything that's true regardless of OS (the task, the cascade plan, edge cases, the data shape, the schedule), and into `<os>-specific.md` for answers that only apply to the OS you're building on (which UI framework, which scheduler glue, which keychain, which install path). This split is what makes a later "now build this for Mac" rebuild cheap — the next forge reads the common stuff back from `AUTHORING.md` + `WORKER.md` and only re-asks the OS-specific bits. Don't worry about polish in either file — `WORKER.md` is the clean version.

### Phase 2 — Cascade design and planning

Read `references/cascade.md` for the tier rules. Decompose the task into units of work — one logical step each — and for every unit pick the cheapest tier that can do it reliably:

| Tier   | Mechanism                                 | Use for                                                   |
|--------|-------------------------------------------|-----------------------------------------------------------|
| CODE   | Deterministic logic (regex, parser, HTTP) | Anything expressible as a precise rule                    |
| LOCAL  | Local LLM on the user's box (Ollama, Hugging Face, …) | Fuzzy classification, small summaries, simple extractions |
| HOSTED | Hosted LLM with the user's API key        | Tasks that need frontier-model judgment                   |

A HOSTED unit is a provider *and* a model, not just a provider — the cascade plan records `<provider>/<model>`, and the cheapest-tier-first rule keeps going inside HOSTED. Default a hosted unit to the balanced model (Sonnet-class) and only reach for the top tier (newest Opus, the flagship) when the unit genuinely needs frontier judgment — a fifty-page contract, multi-step reasoning. Calling the biggest model to rewrite a subject line costs the recipient money on every run for nothing. Model identifiers churn, so confirm the current string before pinning it rather than trusting one from memory; `references/cascade.md` has the tiering and the worked examples.

A LOCAL unit is two choices made **in order — the model first, then the tool that runs it** — and the don't-trust-a-memorized-string discipline applies here too, because local-model popularity churns just as fast. Propose the model that's *currently* most popular for the unit's job (check the Ollama library or a quick search), then pick the runtime: recommend **Ollama** when that model is in the Ollama library, but if it's a Hugging Face–only checkpoint, recommend **Hugging Face** (or LM Studio / llama.cpp / MLX) instead — recommending a tool that can't run the chosen model wastes the user's pick. For a GUI worker the user can also defer the model choice to a run-time settings menu instead of pinning one. `references/interview.md` → "Local model selection" has the full two-step flow.

The skill spec asks for an explicit plan-readback step before any code gets written: a step-by-step list of the units, each tagged CODE / LOCAL / HOSTED, and the worker's name shown clearly. The reason is that a tier disagreement caught here is a one-minute conversation; the same disagreement caught after the code is written is a rewrite. So write the plan, show the user the units, show them the name, and wait for them to confirm before moving on. If they want to swap a unit to a different tier ("I'd rather you call Claude for the summary"), that's the moment to do it.

Two presentation rules the user notices when they're missing: open the plan with a banner the user can't scroll past, and end with a confirmation prompt that's visually unmistakable. Something like:

```
----------------------------------------
START OF PLAN
----------------------------------------
```

at the top, and a clearly-set-off "**Reply `confirm` to proceed, or tell me what to change.**" at the bottom. The reason is the same in both cases: this is the one decision point the user has to make consciously before code gets written, and a wall of plan text with the ask buried inside it is a wall of plan text the user skims and waves through. Make both edges of the plan impossible to miss.

### Phase 3 — Code generation

Once the plan is signed off, lay out the Workspace. Use the setup script — don't create the directory tree by hand. It auto-detects the current OS (the only OS the forge ever targets) so there's no flag for that:

```bash
python scripts/setup_workspace.py --name <worker-slug> --display-name "<Display Name>" --root <path-to-root>
```

`--name` is the kebab-case slug (drives the folder and `WORKER.md`'s `name:` field); `--display-name` is what the user sees in window titles, headings, and **the artifact filename** (`Dave's Receipt Filer.exe`, not `daves-receipt-filer.exe`). If you omit `--display-name`, the script title-cases the slug — only worth passing explicitly when the user picked a name the slug can't reconstruct (e.g., display *"Dave's Receipt Filer"*, slug `daves-receipt-filer`). Pass it whenever the artifact name is meant to look like prose rather than a slug.

This creates `root/workspaces/<worker-name>/` with a per-OS layout — common spec files at the workspace root, everything OS-specific tucked into an OS folder so a future rebuild for a different OS slots in cleanly alongside it:

```
root/workspaces/<worker-name>/
├── AUTHORING.md           # interview notes, decisions, common to every OS
├── WORKER.md              # plain-language spec: name, description, cascade plan
└── <os>/                  # one of: windows/, mac/, linux/ — the current OS
    ├── <os>-specific.md   # OS-specific interview answers and packaging notes
    ├── main.py            # worker task logic — imports worker_runtime
    ├── worker_runtime.py  # the cascade runtime, copied unchanged
    ├── requirements.txt   # Python dependencies
    ├── build_<os>.{bat,sh}# build script for this OS
    ├── resources/         # prompts, schemas, icons, sample inputs
    └── dist/              # built artifact lands here
```

When the same worker is later rebuilt on a second OS, that adds a sibling folder (e.g., `mac/` next to an existing `windows/`) without touching the existing one. The OS folder you generate is the only one you need to read or reason about during this forge — there's nothing in the others that affects your build.

After the script runs, fill in:

- `WORKER.md` — copy `assets/WORKER.md.template` into place and fill it in. Keep the `name` / `description` frontmatter block at the top (this is what makes the file readable both by a future reforge and by anyone auditing what the worker does). The cascade plan, failure modes, and "what it does" all live here, OS-independent.
- `AUTHORING.md` — copy `assets/AUTHORING.md.template` and paste in the interview transcript, the decisions you made, and any alternatives you considered and rejected. Keep this strictly to answers that hold for every OS; the OS-specific stuff goes one level down. This is what makes the worker reforgeable later.
- `<os>/<os>-specific.md` — copy `assets/<os>-specific.md.template` and record the OS-specific answers from the interview (UI framework, scheduler glue, data path conventions, keychain backend, packaging caveats like Gatekeeper). When the user later runs the forge on a new OS, the new `<os>-specific.md` is the only place you have to fill from a fresh interview.
- `<os>/main.py` — the worker's task logic. Import `worker_runtime` (copied unchanged from `assets/worker_runtime.py`), instantiate a `Worker` with the cascade plan, and wire the units together. The runtime handles first-run setup — local-model check (Ollama or Hugging Face, per the unit's chosen runtime), API key prompt, keyring storage — so don't reinvent it.
- `<os>/requirements.txt` — Python dependencies.
- `<os>/build_<os>.{bat,sh}` — the build script. The setup script already copied the right one for the current OS.
- `<os>/resources/` — anything the worker needs at run time that isn't code: prompts, schemas, sample inputs. If the user provided an icon during the interview, drop it here as `icon.<ext>` and the build script will wire it in.

As you create each script, give it a quick security read — sanitize anything coming from outside the worker (CLI args, files, HTTP responses, model output) before using it in a path, shell, or query, and keep each unit's inputs scoped to only what it needs. `references/packaging.md` has the full checklist; the point is to fix the easy stuff while you're already looking at the code, not save it all for the end.

If the worker has a GUI, the look-and-feel default is **not** "whatever Tkinter draws out of the box." Read `references/default-theme.md` and apply it. The short version: a clean, **light** palette modeled on Tailwind CSS layout/radius/sizing tokens and the Claude Code app on macOS, rounded corners on every container and control, a title bar painted the same color as the app body (the single rule that breaks most often — don't let the OS draw a mismatched native title bar over a themed window), and a single system font at a small set of sizes. The reason this is a default rather than an option is that "modern desktop app" is the bar users expect now, and a worker that doesn't clear it reads as broken even when it works. Deviate only when the user explicitly asked for a different look during the interview and recorded that in `AUTHORING.md`.

The default UI framework is **the OS-native one**, not Electron. On macOS that's SwiftUI (an `.app` in the 5–15 MB range); on Windows it's WinUI / WinAppSDK (a similarly small `.exe`); on Linux it's GTK4 or Qt against the system libraries. Native is the first option you suggest because it's the smallest binary, the lightest at run time, and the closest match for the platform's own look — which is what the theme is calibrated to anyway. **Then offer the heavier cross-platform options as conditional fallbacks, and quote a rough installed size next to each so the user can trade off**: if `npm` is on the `PATH`, offer **Electron + Tailwind CSS** (≈ 80–150 MB — bundles Chromium, but gets the Claude-Code-style chrome with the least custom CSS); if a Rust toolchain is on the `PATH`, offer **Tauri** (≈ 5–20 MB — uses the system webview, almost native-sized); Python-stack fallbacks are PySide6 (≈ 40–80 MB) and Tkinter (≈ 10–30 MB) when nothing else fits. Present the list in that order, with the native pick first and recommended, and the bundle-size estimate alongside each option in the AskUserQuestion call. Don't silently fall back to Tkinter — the user picks the framework, and the pick lands in `<os>-specific.md`.

Cross-compilation is out. The skill always builds for the current OS, never for a different one — there's no flag, no question, no fallback. If the user wants the worker on a different OS, they run the forge again on that OS (see Reforge).

### Phase 4 — Packaging

Read `references/packaging.md` for the build details on the OS you're running on (PyInstaller flags on Windows, py2app or PyInstaller on macOS, AppImage tooling on Linux), the binary-distribution and minimum-network-fetch rules, and the final security pass.

Three things to do before you offer to build:

1. **Final security scan.** Re-read the OS folder as a whole — every script under `<os>/`, every file in `<os>/resources/`, the build script itself. The per-script reads during code-gen catch local issues; this pass catches the ones that only show up when units compose (a URL fetched by one unit getting used as a filename by another, leftover debug flags, `resources/` files the worker no longer uses). `references/packaging.md` has the checklist.
2. **Write the workspace `README.md`.** Copy `assets/README.md.template` to `workspaces/<worker-name>/README.md` and fill in: the worker's display name as the heading, a one-or-two-sentence description of what it does, a bulleted feature list ordered with the most important feature first, the **build commands** for every OS folder that exists in the workspace, and the **run commands** for launching the built worker on each of those OSs. This is the "what is this folder" doc for anyone who opens the workspace; it isn't a duplicate of `WORKER.md` (which is the full spec) — it's the front-door blurb plus the copy-pasteable build-and-run commands. Match the run commands to the trigger style the user picked in the interview (double-click, CLI, GUI).
3. **Offer to build, run it if the user agrees, and test the result.** The build needs the user's permission. If they say yes, run `<os>/build_<os>.{bat,sh}` and stream the output. **Then actually invoke the artifact** if it's safe to (CLI workers with `--help` or a dry-run flag, GUI workers via a short headless smoke test where the framework allows it). If it fails, read the error, patch the code or the build script, and rebuild. Don't ship a binary you haven't seen run at least once. If the user declines the build, leave the script in place with a short note in `WORKER.md` telling them how to run it themselves — that's a known branch, not a failure.

If you literally can't run the build script from where you are (the sandbox is missing `pyinstaller` / `npm` / `appimagetool`, the build needs a credential only the user has, an interactive prompt the agent can't satisfy, etc.), **don't go quiet.** Tell the user in one short message: the specific blocker, the exact command to run with the working directory shown, and where the artifact will land when it succeeds. `references/packaging.md` → "When you can't run the build script yourself" has the format. A worker the user doesn't know how to finish building is a forge that produced nothing.

When the build succeeds and smoke-tests cleanly, the artifact lands in `<os>/dist/`. Give the user a `computer://` link to it so they can grab it from their workspace folder.

## Reforge

When the user comes back with a change, read `references/reforge.md`. The short version: read `AUTHORING.md`, `WORKER.md`, and the relevant `<os>-specific.md`, find the unit the change touches, modify it, rebuild. Don't regenerate from scratch unless the diff would be messier than a redo.

Whenever you modify a worker, you **must** update its docs to match before you finish: `WORKER.md` if behavior or the cascade plan moved, `AUTHORING.md` (append, don't rewrite) with what the user asked for and why you changed it, the relevant `<os>-specific.md` for any OS-shaped change, and the workspace `README.md` if the feature list, build commands, or run commands changed. The Workspace is the source of truth, so a code change that leaves the docs stale is an incomplete reforge — record anything worth knowing for a future forge now, while you still have the context.

There's a second flavor of reforge worth calling out, because it shows up often once a user has a worker they like: **building the same worker on a new OS.** The user says something like "now build this for Mac too" while running the skill on their Mac. The Workspace already exists with, say, a `windows/` folder; the worker's behavior is captured in `AUTHORING.md` + `WORKER.md`. You don't redo the whole interview — read the common files for the task, the cascade, and the edge cases, then run only the OS-specific portion of the interview (UI framework, scheduler glue, data path, keychain backend, packaging caveats) and write those answers into the new `mac/mac-specific.md`. Add the `mac/` folder alongside the existing `windows/`, generate the code, and build. `references/reforge.md` has the step-by-step.

If a change can't be made from what `AUTHORING.md` + `WORKER.md` + the relevant `<os>-specific.md` say — meaning the original interview didn't capture enough context — that's a signal the first forge was rushed. Re-interview the user on the missing details and write the new context back to the right file (common stuff to `AUTHORING.md`, OS-specific stuff to `<os>-specific.md`) before you make the change. This is how the Workspace stays useful over time.

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
├── README.md                     # front-door doc: name, blurb, ordered features, build + run commands
├── AUTHORING.md
├── WORKER.md
└── windows/                      # or mac/, or linux/ — whichever OS this forge ran on
    ├── windows-specific.md
    ├── main.py
    ├── worker_runtime.py
    ├── requirements.txt
    ├── build_windows.bat
    ├── resources/
    └── dist/
        └── My Worker.exe         # display name, not the slug; only if the build ran
```

If the user later asks for the same worker on a second OS, a sibling folder shows up next to the first (e.g., `mac/` next to `windows/`) and that one gets its own `dist/My Worker.app`. The two OS folders are independent — building one never touches the other.

The Workspace is the source of truth. The artifact in `<os>/dist/` is the distributable. Both ship together — the user (or whoever they hand the worker to) should always be able to read the source for what's running on their machine.

## Reference files

- `references/interview.md` — the full question set for the interview phase, with options and notes on which combinations are mutually exclusive.
- `references/cascade.md` — how to pick CODE vs. LOCAL vs. HOSTED for each unit, including which hosted model tier (Opus / Sonnet / Haiku-class) to pick within HOSTED and how to confirm the current identifier, with worked examples.
- `references/default-theme.md` — the default look-and-feel for workers with a GUI (Tailwind-CSS-inspired light theme calibrated to the Claude Code app on macOS — rounded corners, unified title bar). Framework order: native first (SwiftUI / WinUI / GTK, smallest binaries), Electron + Tailwind when `npm` is available, Tauri when Rust is, with PySide6 / Tkinter as Python fallbacks. Bundle-size estimates live in that file. Apply verbatim unless the user explicitly asked for something else.
- `references/packaging.md` — OS-specific build details, binary-distribution rules, minimum-network-fetch rules, the per-script and final security review, and what to do when the host OS doesn't match the target.
- `references/reforge.md` — how to apply a change to an existing Workspace without regenerating.

- `scripts/setup_workspace.py` — creates the Workspace directory tree. Use this; don't lay the folders out by hand.

- `assets/WORKER.md.template` — the spec template (workspace root, OS-agnostic).
- `assets/AUTHORING.md.template` — the rationale-layer template (workspace root, OS-agnostic).
- `assets/README.md.template` — the front-door doc that lands at the workspace root after a successful forge: blurb, feature bullets, and per-OS build + run commands.
- `assets/windows-specific.md.template`, `assets/mac-specific.md.template`, `assets/linux-specific.md.template` — OS-specific interview-answer templates. The setup script drops the right one inside the new `<os>/` folder.
- `assets/worker_runtime.py` — the cascade runtime, copied unchanged into every OS folder.
- `assets/build_windows.bat`, `assets/build_macos.sh`, `assets/build_linux.sh` — build scripts per OS. The setup script copies whichever one matches the current OS into the new `<os>/` folder.
- `assets/setup_local_models.sh`, `assets/setup_local_models.bat` — first-run model-fetch script for the chosen LOCAL runtime (`ollama pull` for Ollama, `hf download` for Hugging Face). Drop into `<os>/resources/` if the user agreed to bundle one during the interview.
- `assets/requirements.txt` — minimal Python dependencies for the worker.

Good luck. The interview is where this skill is won or lost — take the time on it.
