# Interview

The interview is the highest-leverage phase of the forge. Most workers that turn out wrong, turn out wrong because someone rushed the interview. The point isn't to fill out a form — it's to get a description sharp enough that you (or a future reforge) could build the worker from it without having to ask the user anything else.

Use the AskUserQuestion tool for structured choices. It forces concrete answers and renders cleanly. Free-text answers are fine for things like "describe the UI" and "what does success look like", but anything that's a known-set choice (OS target, data store, trigger) should be a multiple-choice question.

**Suggest a concrete default for every question.** Don't just present a blank menu — read what the user already told you and propose the pick you'd make if it were up to you, then let them confirm or override. "Looks like a Mac-only worker since you're filing screenshots to iCloud — I'd ship macOS only, sound right?" beats "Which OSes do you want to target?" by a mile, because the user's job is to react to a guess instead of generating a spec from scratch. The same goes for the worker name, the data location, the model picks, even the icon — the skill is more useful when the user mostly has to say "yes" or "no, do this other thing instead." If you genuinely can't infer a default, say so and ask, but treat that as the exception.

## How to run it

The flow is roughly:

1. Understand the task. Get them to describe what they want in their own words. Don't interrupt with questions yet.
2. Restate it back. One short paragraph. Wait for confirmation.
3. **If the restated task needs a local model anywhere, try to find a CODE-only shape first.** This is the most important habit in the entire interview. A user who asks for "AI" usually doesn't need one — they're describing the *behavior* they want, not the implementation. "Categorize my downloads" sounds like classification but probably means "look at the extension and bucket by type." Propose the deterministic version; if it satisfies them you've just saved them a model download and a lot of run-time slowness. Escalate to LOCAL only when you've genuinely failed to find a CODE shape.
4. Run through the structured questions below. Skip the ones that don't apply.
5. End with the plan readback (see `cascade.md`). The user signs off on both the worker name and the cascade plan before you write any code.

## Questions to ask

Ask these in order; skip any that obviously don't apply. Options labeled "USER_PROVIDE" mean "let the user type a custom value if none of the presets fit." Where two options are mutually exclusive, the question can be single-select; otherwise let the user pick multiple.

### Worker name and display name

> "I'd call this `receipt-filer` (display name *Receipt Filer*). Want to use that, or pick your own?"

Two things to capture, and you should propose both before the user has to think:

- **Worker name (slug)** — kebab-case, used for the workspace folder (`workspaces/<slug>/`), the artifact filename (`<slug>.exe`, `<slug>.app`), and the `name:` field in `WORKER.md`'s frontmatter. Has to be filesystem-safe — lowercase, letters/digits/hyphens only, no spaces. Derive a candidate from what the user described and offer it.
- **Display name** — the human-readable version. Shows up in the window title, the about box, the first-line log message, and the `# Heading` of `WORKER.md`. Title Case is the safe default. If the user doesn't care, derive it from the slug (`receipt-filer` → `Receipt Filer`) and move on.

The two often differ only in capitalization and spaces; don't make the user think about them as separate decisions unless they push back on the proposed pair. If the user types a display name with characters that won't slugify cleanly ("Dave's Receipt Filer!"), pick the obvious slug ("daves-receipt-filer") and confirm in one beat.

### Target OS

> "Which OS should the worker run on?"

Options: Windows, macOS, Linux, USER_PROVIDE (multi-select OK — some workers will ship to all three, but you'll generate a separate build script per OS).

This decides the build script and the artifact format. Cross-compilation is out — a worker for Windows is built on Windows. If the user picks an OS that doesn't match the machine you're running on, that's fine; you'll hand them the build script and they'll run it on a matching box.

### Trigger style

> "How do you want to start the worker?"

Options: DOUBLE_CLICK_ONLY_NO_GUI, CLI, GUI, USER_PROVIDE.

DOUBLE_CLICK_ONLY_NO_GUI and GUI are mutually exclusive — a worker either pops a window or it doesn't, you can't half-do it. CLI can be combined with either of the other two (a GUI worker can still accept command-line flags, a no-GUI worker can take CLI args too).

If they pick GUI, ask the UI framework question next. If they pick CLI or DOUBLE_CLICK_ONLY_NO_GUI, skip it.

### Icon

> "Want me to use the default worker-forge icon, or do you have one to ship with this worker?"

Options: Default icon (recommended), USER_PROVIDE.

Default is the right call for almost everyone — the worker already has a usable icon and you save the user a round trip. Offer it first. If they say USER_PROVIDE, ask for an image (PNG works for everything, `.ico` for Windows specifically, `.icns` for macOS app bundles) and drop it into the workspace's `resources/` as `icon.<ext>`. The build script picks it up from there and passes it to PyInstaller via `--icon`.

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

> "Which UI framework do you want?"

Options: Native GUI (Tkinter on every OS; SwiftUI on macOS if they prefer; WinUI on Windows if they prefer), OTHERS, USER_PROVIDE.

- **OTHERS** — try to detect what UI frameworks are already installed on the host machine (Electron, Tauri, PySide6, etc.) and present those as options. If you can't detect anything, fall back to Native GUI.
- **USER_PROVIDE** — let the user name the framework. If it isn't installed, help them install it before you continue. Don't generate code against a framework the user doesn't have.

If the user has no strong preference, default to Tkinter — it ships with Python, builds with PyInstaller cleanly, and produces small binaries.

### Color theme

Ask only if the trigger style includes GUI.

> "Dark theme or light theme for the UI?"

Options: DARK (recommended), Light, USER_PROVIDE.

Default to dark. Most desktop workers run in environments where a dark UI looks more at home next to the user's other tools, and dark is the safer pick for workers that sit on the screen for a long time. Offer Light as a one-tap alternative for users who want it, and USER_PROVIDE for someone who has a specific palette (e.g., they want the worker to follow their company's brand colors). Whatever they pick, record it in `AUTHORING.md` and apply it consistently across every window the worker draws — half-themed UIs feel broken.

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

## What to capture in AUTHORING.md

The whole interview transcript goes into `AUTHORING.md`. Specifically:

- The user's original ask, in their own words.
- Your restatement and their confirmation.
- The CODE-only shapes you proposed and why they were accepted or rejected.
- Every structured-question answer.
- Any back-and-forth on edge cases (what happens on partial failure, what counts as a duplicate, where outputs go, what success looks like).
- Decisions you made and rejected — "I considered storing this in SQLite but the user only needs to read it once per run, so JSON is simpler." This is the part future-you will thank you for during reforge.

Don't polish `AUTHORING.md`. It's allowed to read like notes. The clean version lives in `WORKER.md`.

## Common interview misses

A few categories of question that are easy to forget but bite later:

- **Partial failure.** "What should the worker do if one of the five RSS feeds is down?" — log and continue, or fail the whole run?
- **Empty results.** "What should the worker do if there's nothing new to report?" — write an empty digest, skip the write, send a "nothing today" message?
- **First run vs. nth run.** Does the worker need to do something special the first time (initialize a database, fetch a baseline)? How does it know it's the first run?
- **Idempotency.** If the worker is run twice in a row, does it duplicate output, or detect "already done" and exit clean?
- **Output collision.** If today's file already exists, overwrite, append, suffix with a number, or fail?

Each of these is the kind of thing that doesn't matter until it matters. Surface them once during the interview and the worker will hold up.
