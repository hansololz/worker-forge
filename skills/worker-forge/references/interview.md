# Interview

The interview is the highest-leverage phase of the forge. Most workers that turn out wrong, turn out wrong because someone rushed the interview. The point isn't to fill out a form — it's to get a description sharp enough that you (or a future reforge) could build the worker from it without having to ask the user anything else.

Use the AskUserQuestion tool for structured choices. It forces concrete answers and renders cleanly. Free-text answers are fine for things like "describe the UI" and "what does success look like", but anything that's a known-set choice (data store, trigger style) should be a multiple-choice question.

**Suggest a concrete default for every question.** Don't just present a blank menu — read what the user already told you and propose the pick you'd make if it were up to you, then let them confirm or override. "JSON file in your home directory sounds right for a worker that just keeps a last-seen timestamp — want that, or pick another?" beats "How should the worker store its data?" by a mile, because the user's job is to react to a guess instead of generating a spec from scratch. The same goes for the worker name, the model picks, even the icon — the skill is more useful when the user mostly has to say "yes" or "no, do this other thing instead." If you genuinely can't infer a default, say so and ask, but treat that as the exception.

**Don't ask about the target OS.** The skill builds for whichever OS it's currently running on; that's the only OS it will ever target in a single run. Detect the host OS (`platform.system()`) and write that down, but don't ask the user to pick. If they later want to ship to a second OS, they re-run the skill on that machine and it adds a sibling folder to the existing Workspace — see `reforge.md` for the flow.

**The interview splits across two files.** Anything that's true of the worker regardless of OS — what it does, the cascade plan, edge cases, partial-failure behavior, the data shape — goes into `AUTHORING.md` at the workspace root. Anything tied to a specific OS — which UI framework on this OS, which scheduler glue, where data conventionally lives on this OS, which keychain backend — goes into `<os>/<os>-specific.md`. This split is what lets a later "now build this for Linux" reforge skip the common questions and only ask the OS-specific ones. When in doubt about where a piece belongs, ask yourself: "would this answer change if we ran this same worker on a different OS?" If yes, OS-specific. If no, common.

## How to run it

The flow is roughly:

1. Understand the task. Get them to describe what they want in their own words. Don't interrupt with questions yet.
2. Restate it back. One short paragraph. Wait for confirmation.
3. **If the restated task needs a local model anywhere, try to find a CODE-only shape first.** This is the most important habit in the entire interview. A user who asks for "AI" usually doesn't need one — they're describing the *behavior* they want, not the implementation. "Categorize my downloads" sounds like classification but probably means "look at the extension and bucket by type." Propose the deterministic version; if it satisfies them you've just saved them a model download and a lot of run-time slowness. Escalate to LOCAL only when you've genuinely failed to find a CODE shape.
4. Run through the structured questions below. Skip the ones that don't apply.
5. End with the plan readback (see `cascade.md` for the format, including the `START OF PLAN` banner and the visually-set-off confirmation prompt). The user signs off on both the worker name and the cascade plan before you write any code — don't bury the "please confirm" ask in a paragraph of plan text, or they'll skim past it and you'll end up building the wrong worker.

## Questions to ask

Ask these in order; skip any that obviously don't apply. Options labeled "USER_PROVIDE" mean "let the user type a custom value if none of the presets fit." Where two options are mutually exclusive, the question can be single-select; otherwise let the user pick multiple.

### Worker name and display name

> "I'd call this `receipt-filer` (display name *Receipt Filer*). Want to use that, or pick your own?"

Two things to capture, and you should propose both before the user has to think:

- **Worker name (slug)** — kebab-case, used for the workspace folder (`workspaces/<slug>/`), the `name:` field in `WORKER.md`'s frontmatter, and any internal identifier that needs to be filesystem-/shell-safe. Lowercase, letters/digits/hyphens only, no spaces. Derive a candidate from what the user described and offer it.
- **Display name** — the human-readable version. Shows up in the window title, the about box, the first-line log message, the `# Heading` of `WORKER.md`, **and the artifact filename in `dist/`** (e.g., `Manga Katana Watcher.exe`, not `manga-katana-watcher.exe`). Title Case is the safe default. If the user doesn't care, derive it from the slug (`receipt-filer` → `Receipt Filer`) and move on. The artifact is the thing the recipient sees in their downloads folder or on their desktop, so it gets the name a human would write, not the slug.

The two often differ only in capitalization and spaces; don't make the user think about them as separate decisions unless they push back on the proposed pair. If the user types a display name with characters that won't slugify cleanly ("Dave's Receipt Filer!"), pick the obvious slug ("daves-receipt-filer") and confirm in one beat.

### Trigger style

> "How do you want to start the worker?"

Options: DOUBLE_CLICK_ONLY_NO_GUI, CLI, GUI, USER_PROVIDE.

DOUBLE_CLICK_ONLY_NO_GUI and GUI are mutually exclusive — a worker either pops a window or it doesn't, you can't half-do it. CLI can be combined with either of the other two (a GUI worker can still accept command-line flags, a no-GUI worker can take CLI args too).

If they pick GUI, ask the UI framework question next. If they pick CLI or DOUBLE_CLICK_ONLY_NO_GUI, skip it.

### Icon

> "Want me to use the default worker-forge icon, or do you have one to ship with this worker?"

Options: **Default icon (recommended)**, USER_PROVIDE.

Always present the default icon as the **first** option and the recommended pick. Most users don't have a custom icon ready, and the bundled `assets/icon.{png,ico,svg}` is good enough to ship — making them produce one before they see their worker run is the wrong tradeoff. Offer "default" first and let them confirm with a single tap.

If they choose USER_PROVIDE, ask for an image (PNG works for everything, `.ico` for Windows specifically, `.icns` for macOS app bundles) and drop it into the workspace's `<os>/resources/` as `icon.<ext>`. The build script picks it up from there and passes it to PyInstaller / electron-builder via the right flag.

If the worker is a no-GUI CLI tool with no `.app` / `.exe` shell that ever shows an icon, you can skip this question entirely — there's no surface to put the icon on.

### Scheduling

> "Do you want the worker to run on a schedule?"

Sub-options (multi-select):

- Periodic trigger only when the worker is running (the worker loops internally).
- Start the worker on system startup (Task Scheduler / launchd / a systemd user unit / login items).
- Run on an external schedule (cron / Task Scheduler / launchd entry that the user wires up).
- No schedule — user invokes by hand.

These aren't mutually exclusive. A worker can start on login *and* loop internally while it's running. Pick whatever the user asks for and write the relevant glue into `build/`.

If the user wants startup launch, write the OS-specific glue (a `.plist` for launchd, a Scheduled Task XML for Windows, a `.desktop` autostart entry for Linux) into `resources/` along with a one-paragraph "how to install this" note in `WORKER.md`.

### UI framework

Ask only if the trigger style includes GUI.

Before you ask, check whether `npm` is on the `PATH` (e.g., `shutil.which("npm")` or a quick `subprocess.run(["npm", "--version"])`). The answer changes which option you recommend first:

- **If `npm` is available** → recommend **Electron + Tailwind CSS** as the first option. This is the default GUI stack for workers and the closest match for the Claude-desktop look defined in `references/default-theme.md`. Phrase it as: *"I'd build the UI with Electron and Tailwind CSS — that gets us a Claude-desktop-style window with one stack. Sound good, or pick another?"*
- **If `npm` is not available** → don't silently fall back to Tkinter. Ask explicitly: *"I'd usually build the UI with Electron + Tailwind, but npm isn't installed on this machine. Want me to walk you through installing Node/npm, or pick a different framework?"* If they don't want to install npm, suggest concrete alternatives — Tauri if they already have Rust toolchain, PySide6 if they want a Python-only stack, Tkinter as the always-available fallback. Record what they pick.

Options: Electron + Tailwind CSS (recommended when npm is present), Native GUI (Tkinter on every OS; SwiftUI on macOS if they prefer; WinUI on Windows if they prefer), OTHERS, USER_PROVIDE.

- **OTHERS** — try to detect what UI frameworks are already installed on the host machine (Tauri, PySide6, etc.) and present those as options. If you can't detect anything, fall back to Native GUI.
- **USER_PROVIDE** — let the user name the framework. If it isn't installed, help them install it before you continue. Don't generate code against a framework the user doesn't have.

Whichever framework gets picked, the look-and-feel target is the same — see `references/default-theme.md`.

### Color theme

Ask only if the trigger style includes GUI.

> "Light theme or dark theme for the UI?"

Options: LIGHT (recommended), Dark, USER_PROVIDE.

Default to light. The skill ships a Claude-desktop-style light theme in `references/default-theme.md` — warm off-white canvas, soft borders, terracotta accent, unified title bar, generous spacing. That's what "LIGHT" applies, top to bottom: palette, rounded corners, typography, spacing, components. Don't make the user pick hex codes or component-by-component styling; "light" is the whole package, and it's calibrated to look at home next to the Claude desktop app the user probably already has open.

Offer Dark as a one-tap alternative (same set of rules, different palette — `default-theme.md` covers both), and USER_PROVIDE for someone who has a specific palette (e.g., they want the worker to follow their company's brand colors). Whatever they pick, record it in `AUTHORING.md` and apply it consistently across every window the worker draws — half-themed UIs feel broken.

One question that's easy to forget but matters: the worker's title bar should be the same color as the body. The OS will happily draw a native title bar that doesn't match your Electron or Tkinter window if you don't override it, and that's the single thing that makes a worker look unfinished. `default-theme.md` has the per-framework recipe; don't ship a worker with a mismatched title bar.

### Data storage format

> "How should the worker store its data?"

Options: SQLite, text file, JSON file, USER_PROVIDE.

Pick whatever fits the data shape. SQLite for anything queryable or relational; JSON for structured but small state (config, last-seen timestamps, small lists); text file for log-style append-only output. USER_PROVIDE if the user has an existing data store (a spreadsheet they update, a Notion database, a Postgres they own).

### Data location

> "Where should the worker keep its files?"

Options: Same directory as the worker, the user's home directory, a mounted drive, USER_PROVIDE.

"Same directory" works for self-contained workers but breaks if the user moves the binary. "Home directory" (use `~/.<worker-name>/` on Unix, `%LOCALAPPDATA%\<worker-name>\` on Windows) is the boring-but-correct default. Mounted drive when the user is explicitly shuttling output to a NAS or external disk. USER_PROVIDE for everything else.

### UI description (if GUI)

> "Walk me through what the UI should look like and do."

Free text. You want to come away knowing: what windows or screens exist, what controls each one has, what the worker does when each control is touched, what error states the UI needs to handle. If they say "just like Notepad", that's an answer — match it.

### Local model selection

Ask only if any unit in the planned cascade is LOCAL.

> "Which local model should the worker use for `<subtask>`?"

Options: OLLAMA, OS MODELS (the platform's built-in inference — Apple Foundation Models, Windows Copilot Runtime — where available), USER_PROVIDE.

Ask this once per LOCAL unit if different units need different models (a classifier and a summarizer often want different models). For OLLAMA, default to `llama3.2:3b` for small tasks and `llama3.1:8b` for anything that needs more headroom; the user can override.

If the worker uses any LOCAL unit, also ask:

> "Want me to bundle a setup script that installs the model on first run?"

If yes, generate a small script that checks for Ollama, runs `ollama pull <model>` for each model the worker uses, and lands it in `resources/setup_local_models.sh` (or `.bat`). The runtime calls this on first run if the model isn't present.

### Hosted model selection

Ask only if any unit in the planned cascade is HOSTED.

> "Which hosted model should the worker use for `<subtask>`?"

Options: ANTHROPIC, OPEN_AI, GEMINI, USER_PROVIDED.

Ask once per HOSTED unit. Different units can use different providers.

If the worker uses any HOSTED unit, also ask how the user wants the worker to authenticate with the provider — first-run prompt that stores the key in the OS keyring, environment variable, config file in the data directory. Make a suggestion (keyring is the right default for most users — secure, no key in plaintext, no env shenanigans) and confirm.

If the worker has no HOSTED units, skip this section entirely. The user shouldn't see an API-key prompt for a worker that doesn't need one.

## What to capture, and where

Two files take the interview transcript: `AUTHORING.md` at the workspace root for everything that holds across OSes, and `<os>/<os>-specific.md` for the answers tied to the OS you're forging on right now. The split is what makes a later "build me a Mac version too" reforge cheap.

**Goes in `AUTHORING.md` (workspace root, OS-agnostic):**

- The user's original ask, in their own words.
- Your restatement and their confirmation.
- The CODE-only shapes you proposed and why they were accepted or rejected.
- Worker name (slug), display name.
- Trigger style (double-click / CLI / GUI).
- Scheduling intent (run on startup, periodic loop while running, external scheduler, ad-hoc — what the user *wants*, not how it's wired on each OS).
- Color theme.
- Data storage **format** (SQLite, JSON, text, etc.).
- UI description (what the windows do, in words — not which framework draws them).
- Hosted model picks per HOSTED unit.
- Cascade plan, edge cases, partial-failure behavior, idempotency rules.
- Decisions and rejected alternatives — "I considered storing this in SQLite but the user only needs to read it once per run, so JSON is simpler." This is the part future-you will thank you for during reforge.

**Goes in `<os>/<os>-specific.md`:**

- The host OS this was forged on (so a future read knows which OS this answer set applies to).
- UI framework picked on this OS (Tkinter / SwiftUI / WinUI / Electron / whatever).
- Data **location** on this OS (the actual path — `~/.<worker>/`, `%LOCALAPPDATA%\<worker>\`, `$XDG_DATA_HOME/<worker>/`).
- Scheduler glue picked on this OS (launchd `.plist`, Windows Task Scheduler XML, systemd user unit, `.desktop` autostart).
- Local model picks per LOCAL unit on this OS (e.g., Ollama vs. Apple Foundation Models vs. Windows Copilot Runtime).
- Keychain backend (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux).
- Packaging caveats specific to this OS (Gatekeeper bypass step on macOS, SmartScreen warning on Windows, AppImage tooling on Linux).

Don't polish either file. They're allowed to read like notes. The clean spec lives in `WORKER.md`.

## Common interview misses

A few categories of question that are easy to forget but bite later:

- **Partial failure.** "What should the worker do if one of the five RSS feeds is down?" — log and continue, or fail the whole run?
- **Empty results.** "What should the worker do if there's nothing new to report?" — write an empty digest, skip the write, send a "nothing today" message?
- **First run vs. nth run.** Does the worker need to do something special the first time (initialize a database, fetch a baseline)? How does it know it's the first run?
- **Idempotency.** If the worker is run twice in a row, does it duplicate output, or detect "already done" and exit clean?
- **Output collision.** If today's file already exists, overwrite, append, suffix with a number, or fail?

Each of these is the kind of thing that doesn't matter until it matters. Surface them once during the interview and the worker will hold up.
