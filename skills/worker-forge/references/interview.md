# Interview

The interview is the highest-leverage phase of the forge. Most workers that turn out wrong, turn out wrong because someone rushed the interview. The point isn't to fill out a form — it's to get a description sharp enough that you (or a future reforge) could build the worker from it without having to ask the user anything else.

Use the AskUserQuestion tool for structured choices. It forces concrete answers and renders cleanly. Free-text answers are fine for things like "describe the UI" and "what does success look like", but anything that's a known-set choice (data store, trigger style) should be a multiple-choice question.

**Suggest a concrete default for every question.** Don't just present a blank menu — read what the user already told you and propose the pick you'd make if it were up to you, then let them confirm or override. "JSON file in your home directory sounds right for a worker that just keeps a last-seen timestamp — want that, or pick another?" beats "How should the worker store its data?" by a mile, because the user's job is to react to a guess instead of generating a spec from scratch. The same goes for the worker name, the model picks, even the icon — the skill is more useful when the user mostly has to say "yes" or "no, do this other thing instead." If you genuinely can't infer a default, say so and ask, but treat that as the exception.

**Always recommend, and exemplify every option in one line.** The default-suggesting habit above has two halves, and both have to be present on every structured question for the interview to feel like confirming a plan instead of filling out a form:

- *Always make a recommendation, and put it first marked `(recommended)`.* Mark the option you'd pick as recommended, lead with it, and say so — even when the choice feels obvious. Order isn't cosmetic: the user reads top-down, so the recommended pick should be the first thing they see, and the rest of the list reads as "or, if not that, here's why you'd deviate." A question with no recommended pick hands the decision back to the user, which is the work they came to the forge to avoid. The recommendations in this file are starting points; sharpen them against what the user actually described (a worker that keeps one timestamp doesn't need SQLite no matter what the generic default says).
- *Keep the list short — five options at most.* When a question has more candidates than that (frameworks, model runtimes, providers), don't list them all — show only the handful that fit *this* worker and fold the long tail into a single USER_PROVIDE escape hatch. A menu of ten options is the same decision fatigue as a blank one; the user is here so you can narrow the field for them, not hand it back wider.
- *Give every option a concise one-line rationale.* Each choice in the AskUserQuestion carries a short "when you'd pick this" — the option descriptions throughout this file are written that way on purpose, e.g. `SQLite` → *"queryable or relational data you'll filter later"*, `JSON` → *"small structured state like a last-seen timestamp"*, `text file` → *"append-only logs, one line per run"*. Keep it to a single clause; the point is that the user can tell the options apart at a glance, not read a tutorial. A bare menu of labels (`SQLite / JSON / text`) forces the user to either already know the trade-off or stop and ask — both defeat the interview. Carry the same shape into questions whose options aren't pre-written below, like the model and runtime picks.

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

Options, each with its one-line rationale in the description:

- **DOUBLE_CLICK_ONLY_NO_GUI** — *"fire-and-forget: double-click and it runs, no window."* Right for a worker that just does its job and writes a file.
- **CLI** — *"you'll run it from a terminal or a script, with flags."* Right when it'll be driven by cron, another script, or a power user.
- **GUI** — *"opens a window the recipient clicks around in."* Right when someone needs to see output or push buttons.
- **USER_PROVIDE** — *"none of these — describe how you want to launch it."*

DOUBLE_CLICK_ONLY_NO_GUI and GUI are mutually exclusive — a worker either pops a window or it doesn't, you can't half-do it. CLI can be combined with either of the other two (a GUI worker can still accept command-line flags, a no-GUI worker can take CLI args too).

If they pick GUI, ask the UI framework question next. If they pick CLI or DOUBLE_CLICK_ONLY_NO_GUI, skip it.

### Icon

> "Want me to use the default worker-forge icon, or do you have one to ship with this worker?"

Options, recommended first, each with its one-line rationale:

- **Default icon (recommended)** — *"ship now; the bundled icon looks finished."*
- **USER_PROVIDE** — *"you have your own art ready to drop in."*

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

**The first option is always the OS-native framework**, and you recommend it. Native is the smallest binary, the lightest at run time, and the closest match for the Claude-Code-style look the theme is calibrated to. The cross-platform alternatives (Electron, Tauri) are *conditional* fallbacks — only offer them when their toolchains are already on the host, and quote a rough binary size next to each so the user can trade off explicitly. Don't lead with Electron just because `npm` happens to be installed.

Before you ask, detect what's available on the `PATH`:

- `shutil.which("npm")` → whether **Electron** is a realistic option (it needs Node).
- `shutil.which("cargo")` or `shutil.which("rustc")` → whether **Tauri** is a realistic option (it needs the Rust toolchain).
- The host OS itself tells you which native framework to suggest first (SwiftUI on macOS, WinUI / WinAppSDK on Windows, GTK4 or Qt on Linux).

Then phrase the question as: *"I'd build the UI as a native `<platform>` app (~5–15 MB) — smallest binary and the closest match for the look I have in mind. Want that, or one of the cross-platform options?"* and list the alternatives that the host actually supports, with bundle-size estimates inline.

Present the AskUserQuestion options in this order, with the native option **first** and **recommended**, and the size estimate visible in the option label so the user sees the trade-off without having to ask:

1. **Native `<platform>` (recommended, ≈ 5–15 MB)** — SwiftUI on macOS, WinUI on Windows, GTK4 or Qt on Linux. Default unless the user has a reason to pick otherwise.
2. **Electron + Tailwind CSS (≈ 80–150 MB)** — *show this option only if `npm` is on the `PATH`.* Heavy because it bundles Chromium, but the shortest path to a Tailwind-driven webview UI and the closest match for `references/default-theme.md` if the user wants a webview.
3. **Tauri (≈ 5–20 MB)** — *show this option only if a Rust toolchain is on the `PATH`.* Uses the system webview, so it stays near-native-sized while still letting you style with Tailwind.
4. **PySide6 / PyQt (≈ 40–80 MB)** — Python-only stack option for users who don't want to install Node or Rust.
5. **Tkinter (≈ 10–30 MB)** — always-available fallback when nothing else fits.
6. **OTHERS / USER_PROVIDE** — let the user name a framework. If it isn't installed, help them install it before you continue; don't generate code against a framework the user doesn't have.

Two notes on the offer:

- **Quote the size estimate inline in the option label**, not in a footnote. The estimate is what makes "native vs. Electron" a real decision instead of a coin flip; if the user only sees framework names, they'll pick whichever sounds familiar.
- **Skip options whose toolchain isn't present.** Don't offer Electron on a host without `npm`, and don't offer Tauri on a host without `cargo` — offering a framework you can't actually build wastes the user's pick. If the user *wants* a framework you couldn't offer, USER_PROVIDE captures that and you help them install the toolchain before generating code.

Whichever framework gets picked, the look-and-feel target is the same — see `references/default-theme.md`. The pick (and the size the user signed off on) lands in `<os>-specific.md`.

### Color theme

Ask only if the trigger style includes GUI.

> "Light theme or dark theme for the UI?"

Options, recommended first, each with its one-line rationale:

- **LIGHT (recommended)** — *"warm, finished, at home next to the Claude desktop app."*
- **Dark** — *"same theme, dark palette — for a worker that lives on a dark desktop."*
- **USER_PROVIDE** — *"you have a specific palette, e.g. your company's brand colors."*

Default to light. The skill ships a Claude-desktop-style light theme in `references/default-theme.md` — warm off-white canvas, soft borders, terracotta accent, unified title bar, generous spacing. That's what "LIGHT" applies, top to bottom: palette, rounded corners, typography, spacing, components. Don't make the user pick hex codes or component-by-component styling; "light" is the whole package, and it's calibrated to look at home next to the Claude desktop app the user probably already has open.

Offer Dark as a one-tap alternative (same set of rules, different palette — `default-theme.md` covers both), and USER_PROVIDE for someone who has a specific palette (e.g., they want the worker to follow their company's brand colors). Whatever they pick, record it in `AUTHORING.md` and apply it consistently across every window the worker draws — half-themed UIs feel broken.

One question that's easy to forget but matters: the worker's title bar should be the same color as the body. The OS will happily draw a native title bar that doesn't match your Electron or Tkinter window if you don't override it, and that's the single thing that makes a worker look unfinished. `default-theme.md` has the per-framework recipe; don't ship a worker with a mismatched title bar.

The other easy-to-forget tell — and it applies whatever theme the user picked, so it's worth noting here even if you skip `default-theme.md` for a dark or custom palette — is encoded text. Any text the worker pulls from a feed, a web page, or an API tends to arrive HTML-encoded, and rendering it raw makes the window show `Dave&#039;s &quot;news&quot;` where the user expects `Dave's "news"`. Decode entities once at the point the outside text enters the worker (Python: `html.unescape()`; webview: assign to `textContent`, not `innerHTML`) so the UI shows real characters, never the codes. `default-theme.md` ("Text from the outside world") has the per-framework detail.

### Data storage format

> "How should the worker store its data?"

Options, each carrying the one-line rationale that tells them apart:

- **SQLite** — *"queryable or relational data you'll filter or join later."* A searchable history of every receipt filed.
- **JSON file** — *"small structured state."* Config, a last-seen timestamp, a short list.
- **text file** — *"append-only, log-style output."* One line per run.
- **USER_PROVIDE** — *"you already have a store to write into."* A spreadsheet you update, a Notion database, a Postgres you own.

Recommend whatever fits the data shape, and say which and why — don't reach for SQLite when the worker only keeps one timestamp.

### Data location

> "Where should the worker keep its files?"

Options, each with its one-line rationale; lead with home directory as the recommended default:

- **Home directory (recommended)** — *"survives the binary moving."* `~/.<worker-name>/` on Unix, `%LOCALAPPDATA%\<worker-name>\` on Windows — the boring-but-correct default.
- **Same directory as the worker** — *"self-contained, but breaks if the binary moves."* Fine for a worker that never leaves its folder.
- **A mounted drive** — *"output belongs on a NAS or external disk."* When the user is explicitly shuttling files off-machine.
- **USER_PROVIDE** — *"somewhere specific you have in mind."*

### UI description (if GUI)

> "Walk me through what the UI should look like and do."

Free text. You want to come away knowing: what windows or screens exist, what controls each one has, what the worker does when each control is touched, what error states the UI needs to handle. If they say "just like Notepad", that's an answer — match it.

### Local model selection

Ask only if any unit in the planned cascade is LOCAL. This is **two questions asked in order — the model first, then the tool that runs it.** The order matters: which model the unit needs is the real decision, and it constrains the runtime (some models live only on Hugging Face, some only ship as Ollama-library tags), so picking the model first means the runtime question can be answered honestly instead of defaulting to whatever's familiar.

Ask the pair once per LOCAL unit if different units need different models — a classifier and a summarizer often want different ones.

#### Step 1 — the model

> "For `<subtask>`, I'd reach for `<currently-popular-model>` — want that, or something else?"

Don't pin a model from memory. Local-model popularity churns about as fast as hosted model identifiers do — new releases land, old tags fall out of favor — and the design doc flags exactly this kind of drift as a first-class risk. So before you ask, **check what's currently popular for the unit's job**: skim the Ollama library's trending / most-pulled list (`https://ollama.com/library`) or do a quick search ("best local model for `<task>` `<year>`"). Then propose the most popular model that fits as the recommended default, with a couple of alternatives so the trade-off is visible.

Present the options roughly like this, recommended pick first:

1. **`<most-popular-fitting-model>` (recommended)** — the current go-to for this kind of work. A small text model (≈3–4B) is the right default for low-latency classification and short summaries; reach for a larger one (≈7–8B+) only when the unit needs more headroom; pick a vision-capable model when the unit reads images.
2. **A larger / smaller alternative** — name the one a size up or down, so the user can trade latency for quality with one tap.
3. **Let the user pick in the worker's settings** — *GUI workers only.* Instead of pinning one model at forge time, the worker's settings screen exposes a model picker the recipient sets at run time. Offer this when the user wants to experiment, or when they'll run the worker on machines with different amounts of memory. When they choose this, the worker stores the selected model in its config rather than hard-coding it, and the settings UI lists the models the chosen runtime has available.
4. **USER_PROVIDE** — they name a specific model.

#### Step 2 — the runtime/tool

Once the model is settled, ask what the worker should use to run it:

> "And to run `<model>`, I'd use `<recommended-runtime>` — sound good?"

Options: **OLLAMA**, **HUGGING FACE**, USER_PROVIDE — plus any other strong option a quick search surfaces (LM Studio, llama.cpp, MLX on Apple Silicon, the platform's built-in inference like Apple Foundation Models or Windows Copilot Runtime).

The recommendation is **conditional on the model you just picked**:

- **If the chosen model is in the Ollama library, recommend OLLAMA first.** It's the smoothest path for a worker — one `ollama pull`, a local HTTP endpoint the runtime already knows how to call, no Python ML stack to bundle.
- **If the model is *not* on Ollama** (it's a Hugging Face–only checkpoint, say), **don't lead with Ollama.** Recommend Hugging Face — pulling the weights via `huggingface_hub` and running through `transformers` — or whichever runtime actually hosts that model. Recommending a tool that can't run the chosen model just wastes the user's pick.

So confirm availability rather than assuming: a quick check of the Ollama library tells you whether Ollama is the honest default or whether Hugging Face (or LM Studio, llama.cpp, MLX) is the better lead. Record the runtime in `<os>-specific.md` (it's OS-shaped — MLX is Apple-only, the platform's built-in inference is OS-specific) and the model in the cascade plan in `WORKER.md` (it's OS-agnostic).

#### Bundling a first-run setup script

If the worker uses any LOCAL unit, also ask:

> "Want me to bundle a setup script that fetches the model on first run?"

If yes, generate a small script that lands in `resources/setup_local_models.{sh,bat}`, matched to the runtime the user picked:

- **Ollama** — check for the `ollama` binary, then `ollama pull <model>` for each model the worker uses.
- **Hugging Face** — check for `huggingface_hub`, then `hf download <repo-id>` (older CLIs: `huggingface-cli download`) for each model, into the local cache the runtime reads from.

The runtime calls this on first run if a model isn't present yet.

### Hosted model selection

Ask only if any unit in the planned cascade is HOSTED.

> "Which hosted provider should the worker use for `<subtask>`?"

Options, each with a one-line rationale; recommend the provider the user is likeliest to already have a key for and say why:

- **ANTHROPIC** — *"Claude models; strong long-context reasoning."*
- **OPEN_AI** — *"GPT models; broad ecosystem and tooling."*
- **GEMINI** — *"Google's models; competitive pricing on the fast tiers."*
- **USER_PROVIDE** — *"another provider, or a key you already pay for."*

Ask once per HOSTED unit. Different units can use different providers.

**Then pick the model, not just the provider.** Picking a provider isn't enough — the cascade plan and `WORKER.md` both record `<provider>/<model>`, and the runtime needs a concrete model string to call. Just as LOCAL units get a concrete default (`llama3.2:3b`), every HOSTED unit needs a concrete model. So propose one the same way you propose everything else: read the unit and suggest the cheapest model that can do it well, then let the user confirm or trade up.

The same cheapest-tier-first instinct that picks CODE over LOCAL applies *inside* HOSTED. Frontier providers ship a lineup that trades capability against cost and latency, roughly three rungs:

- **Top tier** (e.g. Anthropic's Opus line, OpenAI's flagship, Gemini Pro) — reserve for units that genuinely need frontier judgment: long-context reasoning, multi-step plans, a fifty-page contract. This is where you'd reach for the newest Opus.
- **Balanced tier** (e.g. Anthropic's Sonnet line, OpenAI's mid model, Gemini Flash) — the sane default for most HOSTED units: drafting an email, a structured extraction the local model couldn't quite handle, a moderate summary. Fast and a fraction of the cost of the top tier.
- **Fast/cheap tier** (e.g. Anthropic's Haiku line, the provider's smallest hosted model) — for high-volume or latency-sensitive HOSTED units where the judgment bar is low but a local model still wasn't reliable enough.

Default a HOSTED unit to the **balanced tier** and only step up to the top tier when the unit's description tells you it needs frontier judgment. A worker that calls the biggest, slowest, priciest model to rewrite a subject line is the HOSTED-tier version of using an LLM where a regex would do — it costs the recipient real money on every run.

**Confirm the exact model identifier before you write it down.** Hosted model strings change often — new versions ship, old ones get deprecated, and the design doc calls this out as a first-class risk ("Providers shut down and deprecate models on their own schedule"). Don't trust a string from memory. Name the tier you want, then confirm the current identifier with the user or by checking the provider's current model list, and record the verified string in the cascade plan in `WORKER.md` (it's OS-agnostic, so it belongs there and in `AUTHORING.md`, not in `<os>-specific.md`). A worker pinned to a model name that no longer exists fails on its first hosted call.

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
- Local model picks per LOCAL unit (the model identifier, and whether it's pinned or user-selectable in a GUI setting — the *runtime* that runs it is OS-shaped and goes in `<os>-specific.md`).
- Cascade plan, edge cases, partial-failure behavior, idempotency rules.
- Decisions and rejected alternatives — "I considered storing this in SQLite but the user only needs to read it once per run, so JSON is simpler." This is the part future-you will thank you for during reforge.

**Goes in `<os>/<os>-specific.md`:**

- The host OS this was forged on (so a future read knows which OS this answer set applies to).
- UI framework picked on this OS (Tkinter / SwiftUI / WinUI / Electron / whatever).
- Data **location** on this OS (the actual path — `~/.<worker>/`, `%LOCALAPPDATA%\<worker>\`, `$XDG_DATA_HOME/<worker>/`).
- Scheduler glue picked on this OS (launchd `.plist`, Windows Task Scheduler XML, systemd user unit, `.desktop` autostart).
- Local **runtime/tool** per LOCAL unit on this OS (Ollama, Hugging Face / `transformers`, LM Studio, llama.cpp, MLX, Apple Foundation Models, Windows Copilot Runtime), and whether the model is pinned or chosen at run time via a GUI setting. (The model *identifier* itself is OS-agnostic and goes in the cascade plan in `WORKER.md`; the runtime that hosts it is what's OS-shaped.)
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
