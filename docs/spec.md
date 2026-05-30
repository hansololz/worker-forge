# Worker Forge skill — spec

This is the spec for the **worker-forge skill**: the set of requirements the skill has to meet to do its job well. If
you're building or maintaining the skill, this is the doc that tells you what it needs to do and how each phase is
supposed to behave.

It is *not* the system design. `design.md` is — it explains what a Worker and a Workspace are, why the cascade is the
runtime contract, why the Workspace ships with every worker, and the rest of the reasoning behind the shape of the
thing. This doc leans on that one constantly: wherever you'd ask "but why is it built this way?", the answer lives in
`design.md`, and this spec links there rather than restating it. Keeping the two apart is deliberate — a spec that
re-derives the architecture would be a second copy of `design.md` that drifts out of sync the first time someone edits
one and not the other.

So: read `design.md` for the *why*, read this for the *what the skill must do*. The skill's own `SKILL.md` and its
`references/` are the actual implementation; this spec is the brief they answer to.

## The shape of the skill

The skill is the forging agent. It takes a plain-language description of a small repetitive desktop task and turns it
into a self-contained program — a *worker* — laid out inside a *Workspace* the user can audit, rebuild, and reforge. A
fresh forge runs four phases in order: **interview → cascade design → code generation → packaging.** When the user
comes back with a change, the skill **reforges** instead of starting over. (`design.md` → "Solution" has the full
picture of all three lifecycles.)

Two of the four phases are where the skill is won or lost — the interview and the cascade plan. Get the task pinned
down and the tiers right, and code-gen and packaging are mostly mechanical. Rush the interview and you'll be back
forging the same worker again next week. Spend your attention accordingly.

The five invariants from `design.md` ("Solution" → the invariants list) hold for every worker the skill produces, and
they're the quickest gut-check that a forge went right: single responsibility, local-first execution, the recipient is
not the author, cheapest tier first, and reforgeable. If something the skill is about to produce breaks one of these,
that's almost always the interview having missed something — stop and reframe rather than shipping the odd-shaped
worker.

## Platform support

Right now the skill builds for **macOS and Windows only.** Linux is on the roadmap but the toolchain (the AppImage
path, the native GTK/Qt UI, the keychain glue) hasn't shipped, so a forge on a Linux host should stop before the
interview and tell the user plainly: Linux isn't supported yet, and they'd need a Mac or Windows box to forge a worker
today. There's Linux scaffolding scattered through the skill (`linux/` folder logic, `build_linux.sh`, the Linux
templates) — that's groundwork for the future release, not a signal Linux is ready. Treat every Linux reference as
forward-looking.

A forge only ever targets the OS it's running on. There's no cross-compilation and no "which OS?" question — the skill
detects the host, builds for it, and records that. If the user wants the same worker on a second OS, they run the skill
again on that machine and it adds a sibling OS folder to the existing Workspace (see Reforge). The reason is in
`design.md` → "Target OS is chosen at forge time": cross-compilation introduces a class of works-on-my-machine bugs
that are hard to catch from inside a forge run, and predictability is worth more than the convenience.

## Phase 1 — Interview

The interview's job is to get a description sharp enough that you — or a future reforge — could build the worker from
it without asking the user anything else. The single most important habit, and the one easiest to skip under time
pressure, is this: **propose a concrete default for every question.** Read what the user already told you, infer the
pick you'd make, and present it as the thing to confirm. "JSON in your home directory sounds right for a worker that
just keeps a last-seen timestamp — want that, or something else?" beats a blank menu every time, because the user's job
becomes reacting to a guess instead of generating a spec from scratch. The skill earns its keep when the user is mostly
saying "yes, that."

The second habit, called out specifically because it's high-leverage: **if the task as described seems to need a local
model, look for a CODE-only shape first.** A user who says "categorize my downloads" usually means "look at the
extension and bucket by type" — that's regex, not an LLM. People describe the *behavior* they want in AI vocabulary
because that's the vocabulary they have; your job is to hear the underlying shape. Propose the deterministic version,
and escalate to LOCAL only when you've genuinely failed to find a rule that fits. The payoff is in `design.md` →
"Cheapest tier first": the cheaper tier is faster, more available, and more predictable, so a model call where a rule
would do makes the worker worse for everyone who runs it later.

Use the AskUserQuestion tool for the structured choices — it forces concrete answers and the multi-select form maps
onto the "options are mutually inclusive when possible" rule below (a user can want both double-click *and* start-on-
login; those don't conflict). Free text is fine for open questions like "describe the UI" and "what does success look
like."

### The two-file capture split

Everything the interview surfaces gets written down as you go, into one of two places:

- **`AUTHORING.md`** (workspace root) — anything true of the worker regardless of OS: the task, the restatement, the
  CODE-shapes you proposed and why they were taken or dropped, the cascade plan, edge cases, partial-failure behavior,
  the data *format*, trigger style, color theme, hosted-model picks, and the decisions-and-rejected-alternatives that
  future-you will want during a reforge.
- **`<os>/<os>-specific.md`** — anything tied to the OS you're forging on: the UI framework picked here, the data
  *location* (`~/.<worker>/` vs `%LOCALAPPDATA%\<worker>\`), scheduler glue, the local-model runtime, the keychain
  backend, and packaging caveats like Gatekeeper or SmartScreen.

The test for where something goes: *would this answer change if we ran the same worker on a different OS?* If yes,
OS-specific; if no, common. This split is the whole reason a later "now build this for Mac too" reforge is cheap — the
next forge reads the common answers straight back and only re-asks the OS-specific handful. Neither file needs to be
polished; `WORKER.md` is the clean version.

### Questions to ask

Ask these in order, skip the ones that don't apply, and lead each with your proposed default. Where two options are
mutually exclusive the question is single-select; otherwise let the user pick more than one. `references/interview.md`
in the skill has the full phrasing for each.

- **Worker name and display name.** A kebab-case slug (drives the folder, `WORKER.md`'s `name:`, anything that has to
  be filesystem-safe) and a human-readable display name (window titles, headings, and the artifact filename —
  `Receipt Filer.exe`, not `receipt-filer.exe`). Derive both from the task and offer them as a pair; they usually
  differ only in capitalization, so don't make the user think of them as two decisions unless they push back.
- **Trigger style.** DOUBLE_CLICK_ONLY_NO_GUI, CLI, GUI, or USER_PROVIDE. Double-click-no-GUI and GUI are mutually
  exclusive — a worker either pops a window or it doesn't. CLI combines with either. If they pick GUI, the UI-framework
  and color-theme questions follow; if not, skip those.
- **Icon.** Default worker-forge icon (recommended, offered first) or USER_PROVIDE. Most users don't have one ready and
  the bundled icon is good enough to ship — making them produce art before they've seen their worker run is the wrong
  trade. Skip entirely for a no-GUI CLI tool with no icon surface.
- **Scheduling** (multi-select, not mutually exclusive): periodic loop while the worker runs, start on system startup,
  run on an external schedule the user wires up (cron / Task Scheduler / launchd), or no schedule. If they want
  startup launch, write the OS-specific glue (a `.plist`, a Scheduled Task XML, a `.desktop` autostart entry) into
  `resources/` plus a short how-to-install note.
- **UI framework** (GUI only). The first option is always the **OS-native** framework and you recommend it — smallest
  binary, lightest at run time, closest match for the look the theme is calibrated to. Detect what else the host
  supports (`shutil.which("npm")` for Electron, `shutil.which("cargo")` for Tauri) and offer the cross-platform
  options *only when their toolchain is present*, each with a rough installed size in the label so the trade-off is
  visible: native (≈5–15 MB), Electron + Tailwind (≈80–150 MB, npm only), Tauri (≈5–20 MB, Rust only), PySide6
  (≈40–80 MB), Tkinter (≈10–30 MB) as the always-available fallback. Don't silently default to Tkinter, and don't lead
  with Electron just because npm happens to be installed. The pick lands in `<os>-specific.md`.
- **Color theme** (GUI only). LIGHT (recommended), Dark, or USER_PROVIDE. The default is light — the skill ships a
  Claude-desktop-style light theme in `references/default-theme.md` (warm off-white canvas, soft borders, terracotta
  accent, unified title bar) and "LIGHT" applies the whole package, not just a background color. (This resolves an old
  ambiguity in the source notes, which once defaulted to dark; the skill is light-first now, calibrated to look at home
  next to the Claude desktop app the user probably has open.)
- **Data storage format.** SQLite, text file, JSON, or USER_PROVIDE — pick whatever fits the data shape (SQLite for
  anything queryable, JSON for small structured state, text for append-only logs).
- **Data location.** Same directory as the worker, home directory, a mounted drive, or USER_PROVIDE. Home directory is
  the boring-but-correct default; "same directory" breaks the moment the user moves the binary.
- **UI description** (GUI only, free text). What windows exist, what controls each has, what happens when each is
  touched, what error states the UI handles.
- **Local model selection** (only if a unit is LOCAL). Two questions, asked **in this order** — the model first, then
  the runtime that runs it. **(1) The model.** Model popularity churns as fast as hosted identifiers do, so don't pin a
  model from memory: check what's currently popular for the unit's job (the Ollama library's trending / most-pulled
  list, or a quick search) and propose the most popular fitting model as the recommended default, with a couple of
  alternatives alongside it (a small text model for low latency, a larger one for headroom, a vision model for image
  units) and USER_PROVIDE. For a GUI worker, also offer **"let the user pick the model in the worker's settings"** —
  instead of pinning one model at forge time, the GUI exposes a model-picker setting the recipient changes at run time.
  Ask once per LOCAL unit if different units want different models. **(2) The runtime/tool.** After the model is
  decided, ask what the worker should use to run it: OLLAMA, HUGGING FACE, or USER_PROVIDE, plus any other strong option
  a quick search surfaces (LM Studio, llama.cpp, MLX on Apple Silicon, the platform's built-in inference). Recommend
  OLLAMA as the top pick **only when the chosen model is actually in the Ollama library** — if the model is only on
  Hugging Face, don't lead with Ollama; recommend Hugging Face (or whichever runtime hosts that model) instead. Confirm
  availability with a quick search rather than assuming. Finally, ask whether to bundle a first-run setup script that
  fetches the model — an `ollama pull` for Ollama, an `hf download` / `huggingface-cli download` for Hugging Face.
- **Hosted model selection** (only if a unit is HOSTED). First the provider — ANTHROPIC, OPEN_AI, GEMINI, or
  USER_PROVIDE — and **then the model**, because picking a provider isn't enough: the cascade plan records
  `<provider>/<model>` and the runtime needs a concrete string. See the next section for how to pick the model tier.
  Also ask how the worker should authenticate (first-run keyring prompt is the right default — secure, no plaintext key
  on disk). Skip this whole section if there are no HOSTED units; the user shouldn't see an API-key question for a
  worker that never makes a hosted call.

A handful of questions are easy to forget and bite at run time, so surface them explicitly: **partial failure** (one of
five feeds is down — log and continue, or fail the run?), **empty results** (nothing new today — write an empty file,
skip, or send a "nothing today"?), **first run vs. nth run** (does it initialize a DB or fetch a baseline, and how does
it know?), **idempotency** (run twice in a row — duplicate output or detect "already done"?), and **output collision**
(today's file exists — overwrite, append, suffix, or fail?).

When the same worker is later rebuilt on a new OS, read the common answers back from `AUTHORING.md` + `WORKER.md` and
run *only* the OS-specific portion of the interview again — don't re-ask the task.

## Phase 2 — Cascade design and the plan readback

Decompose the task into units of work, one logical step each, and tag each with the cheapest tier that can do it
reliably. `design.md` → "The cascade is the runtime contract" is the canonical statement of why; `references/cascade.md`
has the worked examples.

| Tier   | Mechanism                                  | Use for                                                   |
|--------|--------------------------------------------|-----------------------------------------------------------|
| CODE   | Deterministic logic (regex, parser, HTTP)  | Anything expressible as a precise rule                    |
| LOCAL  | Local LLM on the user's machine (Ollama, Hugging Face, …) | Fuzzy classification, small summaries, simple extractions |
| HOSTED | Hosted LLM with the user's API key         | Tasks that need frontier-model judgment                   |

Tier choice is a *forge-time* decision and it stays one: the tier you tag a unit with is written into the cascade plan,
and that's the tier the unit runs at. The runtime does **not** quietly bump a struggling unit up a tier — if LOCAL turns
out not to be reliable enough, that's a plan change and a rebuild, not a silent run-time fallback (`design.md` → "The
cascade is the runtime contract"). The one narrow exception is a unit whose *input* genuinely varies in shape — the
clean-PDF-vs-photo path in the receipt-filer example — which the runtime supports through an explicit, opt-in `fallback=`
registered on that unit, with the plan naming both paths so a reader can see what happens. Anything beyond that single
declared fallback means the tier was wrong in the plan, not that the runtime should paper over it.

**A HOSTED unit is a provider *and* a model, and the cheapest-tier-first instinct doesn't stop at the tier boundary —
it keeps going inside HOSTED.** Frontier providers ship a lineup that trades capability for cost and latency, roughly
three rungs:

- **Top tier** (Anthropic's Opus line, OpenAI's flagship, Gemini Pro) — for units that genuinely need frontier
  judgment: long-context reasoning, multi-step plans, a fifty-page contract. This is where reaching for the newest Opus
  is the right call.
- **Balanced tier** (Anthropic's Sonnet line, OpenAI's mid model, Gemini Flash) — the default for most HOSTED units.
  Drafting an email, an extraction LOCAL fumbled, a moderate summary. Fast, and a fraction of the top-tier cost.
- **Fast/cheap tier** (Anthropic's Haiku line, the smallest hosted model) — high-volume or latency-sensitive units
  where the judgment bar is low but LOCAL still wasn't reliable enough.

Default a HOSTED unit to the balanced rung and step up only when the unit's description tells you it needs frontier
judgment. Calling the biggest, slowest, priciest model to rewrite a subject line is the HOSTED-tier version of using an
LLM where a regex would do — except the waste lands on the recipient's bill every single run. And because model
identifiers churn (providers ship new versions and retire old ones on their own schedule — `design.md` → "Background"
flags this as a core risk), **don't pin a worker to a model string from memory.** Decide the tier, confirm the current
identifier with the user or the provider's model list, and write the verified string into the cascade plan.

### The plan readback

Before any code gets written, read the plan back to the user for sign-off — a step-by-step list of the units, each
tagged CODE / LOCAL / HOSTED (with the model named for LOCAL and HOSTED units), and the worker's name shown clearly.
The reason is purely economic: a tier disagreement caught here is a one-minute conversation; the same disagreement
caught after the code exists is a rewrite. So show the units, show the name, and wait for an explicit confirm before
moving on — and if the user wants to swap a unit's tier, this is the moment.

Two presentation rules, because users skim: open the plan with a banner they can't scroll past, and end with a
confirmation prompt that's visually unmistakable.

```
----------------------------------------
START OF PLAN
----------------------------------------
```

at the top, the worker name and numbered unit list in the middle, and a bolded **"Reply `confirm` to proceed, or tell
me what to change."** on its own line at the bottom. This is the one decision point the user has to make consciously
before code exists, and an ask buried inside a wall of plan text is an ask the user waves through. Make both edges
impossible to miss.

## Phase 3 — Code generation

Lay out the Workspace with the setup script — don't build the directory tree by hand. It auto-detects the host OS, so
there's no OS flag:

```bash
python scripts/setup_workspace.py --name <worker-slug> --display-name "<Display Name>" --root <path-to-root>
```

That produces `root/workspaces/<worker-name>/` with the common spec files at the root and everything OS-specific one
level down, so a future rebuild for a different OS slots in cleanly alongside:

```
root/workspaces/<worker-name>/
├── AUTHORING.md           # interview notes, decisions — common to every OS
├── WORKER.md              # plain-language spec: name, description, cascade plan
└── <os>/                  # windows/ or mac/ — the current OS
    ├── <os>-specific.md   # OS-specific interview answers and packaging notes
    ├── main.py            # worker task logic — imports worker_runtime
    ├── worker_runtime.py  # the cascade runtime, copied unchanged
    ├── requirements.txt
    ├── build_<os>.{bat,sh}
    ├── resources/         # prompts, schemas, icons, sample inputs
    └── dist/              # built artifact lands here
```

Then fill in `WORKER.md` (keep the `name`/`description` frontmatter — it's what makes the file readable to a reforge and
to anyone auditing the worker), `AUTHORING.md`, the `<os>-specific.md`, and `main.py`. `main.py` imports
`worker_runtime` (copied unchanged from `assets/`), instantiates a `Worker` with the cascade plan, and wires the units
together — the runtime already handles first-run setup (Ollama check, API-key prompt, keyring storage), so don't
reinvent it. The OS folder you generate is the only one you need to reason about; the others, if any, don't affect this
build.

**Security as you go.** Give each script a quick read as you write it — sanitize anything from outside the worker (CLI
args, file contents, HTTP responses, model output) before it lands in a path, shell, SQL string, or HTML/Markdown
render; scope each unit's inputs and file writes to only what it needs; source secrets from the keyring or env, never
plaintext on disk. Fixing the regex while you're looking at it is cheaper than catching it in the final pass.
`references/packaging.md` → "Security review" has the checklist.

**The GUI default is a real theme, not bare Tkinter.** If the worker has a GUI, apply `references/default-theme.md`: a
clean light palette modeled on Tailwind tokens and the Claude Code app on macOS, rounded corners on every container and
control, a single system font, and — the rule that breaks most often — **a title bar painted the same color as the
body**, never the OS-default chrome strip. "Modern desktop app" is the bar users expect now; a worker that doesn't
clear it reads as broken even when it works. Also decode HTML entities at the point outside text enters the worker
(`html.unescape()` in Python, `textContent` not `innerHTML` in a webview) so the UI shows `Dave's "news"` and not
`Dave&#039;s &quot;news&quot;`. Deviate from the theme only when the user asked for something else and you recorded it
in `AUTHORING.md`.

**Framework order:** native first and recommended (SwiftUI on macOS, WinUI on Windows), then the cross-platform options
*the host can actually build*, each with its size estimate, as covered in the interview. Cross-compilation is out —
the skill builds for the current OS, full stop.

## Phase 4 — Packaging

`references/packaging.md` has the OS-specific build details. The defaults: distribute as a **single self-contained
binary** (PyInstaller `--onefile` or the py2app equivalent) so the recipient needs no Python and no `pip install` — a
worker that needs the recipient to have Python 3.11 is a worker they won't run. The only external dependencies that are
OK to require are the ones that can't be bundled and are intrinsic to the worker: a local-model runtime when there's a
LOCAL unit, the hosted provider's endpoint when there's a HOSTED unit. Anything else is a yellow flag — bundle it,
replace it, or surface it to the user as an explicit "this worker needs X" decision. And **fetch the minimum from the
network**: smallest model that does the job, cache anything reused, send only the slice a HOSTED unit actually needs.

Three things before you offer to build:

1. **Final security scan.** Re-read the OS folder as a whole — the per-script reads catch local issues; this pass
   catches the ones that only appear when units compose (a URL one unit fetches getting used as a filename by another),
   plus leftover debug flags, unused `resources/` files, and `requirements.txt` entries the code no longer imports.
2. **Write the workspace `README.md`** (from `assets/README.md.template`): display name as the heading, a one-or-two
   sentence description, a feature list ordered most-important-first, and the **build *and* run commands** for every OS
   folder that exists. This is the front-door doc — short on purpose, distinct from `WORKER.md` (the full spec) and
   `AUTHORING.md` (the rationale).
3. **Offer to build, run it if the user agrees, and smoke-test the result.** Lean toward actually completing the build
   — a worker the user has to package themselves is a worker they may never run. Run `build_<os>.{bat,sh}`, stream the
   output, then *actually invoke the artifact* (CLI workers via `--help` or a dry-run, GUI workers via a short headless
   check where the framework allows). If it fails, read the error, patch, rebuild — don't ship a binary you haven't
   seen run. The artifact in `dist/` is named with the **display name** (`Receipt Filer.exe`, the name a human sees in
   their downloads folder), and you hand it over with a `computer://` link.

If you literally can't run the build from where you are (no `pyinstaller`/`npm` in the sandbox, a credential only the
user has, an interactive prompt you can't satisfy), **don't go quiet.** Tell the user in one short message: the
specific blocker, the exact command with the working directory shown, and where the artifact lands when it succeeds. A
worker the user doesn't know how to finish building is a forge that produced nothing. `references/packaging.md` →
"When you can't run the build script yourself" has the format.

## Reforge

When the user comes back with a change, read `AUTHORING.md`, `WORKER.md`, and the relevant `<os>-specific.md`, find the
unit the change touches, modify it, and rebuild — don't regenerate from scratch unless the diff would be messier than a
redo. `references/reforge.md` has the step-by-step. There are two flavors worth recognizing on sight:

- **A change to an existing worker on the same OS** — "make the digest shorter", "add a Slack notification", "switch
  from Anthropic to OpenAI". Most reforges. Touch one unit, update the cascade plan if the change is structural,
  rebuild.
- **The same worker on a new OS** — the user has it on Windows and now wants it on their Mac. The behavior is already
  captured in the common files, so you don't redo the interview; you run *only* the OS-specific portion (UI framework,
  scheduler glue, data path, keychain) and add a `mac/` folder next to the existing `windows/` without touching it.
  Use `setup_workspace.py --add-os`, which refuses to clobber an existing OS folder.

**Whenever you modify a worker, keep its docs in sync before you finish** — `WORKER.md` if behavior or the cascade plan
moved, `AUTHORING.md` (append, don't rewrite) with what the user asked and why, the relevant `<os>-specific.md` for an
OS-shaped change, and the workspace `README.md` if the features or commands changed. The Workspace is the source of
truth (`design.md` → "The Workspace ships with every worker"), so a code change that leaves the docs stale is an
incomplete reforge. If a change can't be made from what the docs say, that's a signal the first interview cut a corner:
re-interview on the missing details, write the answers back to the right file, *then* make the change.

## Related docs

- `design.md` — the system design: what a worker is and isn't, the cascade as runtime contract, the Workspace layout,
  the lifecycles, the failure modes, and the reasoning behind all of it. Read it first.
- The skill's own `SKILL.md` and `references/` (`interview.md`, `cascade.md`, `default-theme.md`, `packaging.md`,
  `reforge.md`) — the implementation of this spec. When this doc and the skill disagree, one of them is wrong; reconcile
  them rather than letting them drift.
