# Packaging a worker into a native artifact

PyInstaller produces an artifact for the platform it runs on. Cross-compiling is fragile and not supported. So packaging splits into two cases:

1. **Host OS matches target OS.** The forge can run the build itself, with the user's permission. The output lands in `dist/`.
2. **Host OS does not match target OS.** The forge writes the build script into the worker folder and hands it to the user with instructions for running it on a matching machine.

The forge always asks before running the build, even when the host matches. The build is a real action — it installs dependencies, runs PyInstaller, writes a binary. Confirm with the user first.

## What the worker folder looks like

A forged worker is a Python project laid out for build and reforge:

```
<root>/workers/<worker-name>/
├── AUTHORING.md       # rationale: interview, decisions, alternatives considered
├── WORKER.md          # spec: metadata + cascade plan
├── main.py            # the worker's task logic
├── worker_runtime.py  # the cascade runtime, copied unchanged from assets/
├── requirements.txt   # pip dependencies, pinned
├── resources/         # prompts, schemas, templates, sample inputs
├── build/             # the build script for the target OS
│   └── build.bat      # Windows — or build.sh for macOS / Linux
├── dist/              # the built artifact lands here
└── README.md          # what it does, how to run, what it touches
```

The `build/` folder holds exactly one script — the one for the target OS chosen at forge time. The scaffolder picks the right one from `assets/`.

## Build outputs by target OS

| Target | Build script | Artifact | PyInstaller flags |
|---|---|---|---|
| Windows | `build/build.bat` | `dist/<worker>.exe` | `--onefile --console --name <worker>` |
| macOS | `build/build.sh` | `dist/<worker>.app` (a bundle) | `--onefile --windowed --name <worker>` for `.app`; add `--console` if the worker prompts on first run |
| Linux | `build/build.sh` | `dist/<worker>` (static-ish binary) | `--onefile --name <worker>`; optional AppImage wrapper |

Note on macOS: a `.app` with `--windowed` has no console, which breaks first-run prompts (API key, model setup). For workers that escalate to LOCAL or HOSTED, use `--console` and ship a `.command` wrapper, or accept that first-run prompts happen in Terminal. The default templates use `--console` for safety.

## PyInstaller flags worth knowing

- `--onefile` — bundle everything into a single binary. The "one file at distribution" principle made literal. There is a startup cost (PyInstaller unpacks the bundle to a temp dir on first run) but the artifact is shareable as a single attachment.
- `--name <worker-name>` — the artifact's name. Use the slug.
- `--console` — keep a console window. Workers print status, errors, and prompts; without a console those go nowhere on Windows or in a macOS `.app`.
- `--icon <path>` — optional. Skip unless the user provided one.

If you find yourself wanting `--noconsole`, stop. A worker that needs to prompt the user (for an API key, to choose a model) needs stdin/stdout. Use `--console`.

## Dependencies

Common Python libraries to pin in `requirements.txt`:

- `requests` — HTTP. Almost always.
- `pypdf` — PDF text extraction.
- `feedparser` — RSS/Atom feeds.
- `beautifulsoup4` + `lxml` — HTML scraping.
- `anthropic` / `openai` — only if the worker can escalate to hosted LLM.
- `keyring` — OS keyring access for storing the hosted API key.

Pin specific versions. Workers are frozen artifacts. A version that worked at forge time should work forever.

## Running the build (host matches target)

Before running the build, ask the user for permission and show them the command:

> About to build the worker. This will create a virtualenv in `build/.venv/`, install dependencies, and run PyInstaller. Output will land in `dist/<worker>.<ext>`. Should I run it now?

If they say yes, run the script. The build takes one to three minutes typically. When it finishes, hand the user a `computer://` link to the artifact.

If the script fails (usually a missing system Python, a missing build tool, or a dep that needs a compiler), report the error verbatim. Don't paraphrase; the user may need the exact message to debug.

## Handing the script to the user (host does not match target)

When the host OS does not match the target, tell the user:

> The worker is for {target_os}, but I'm running on {host_os}. The build script is at `<worker>/build/build.{ext}`. On a {target_os} machine: open a terminal in the worker folder and run `{command}`. The artifact will land in `<worker>/dist/`.

Give them the exact command. For Windows that's a double-click on `build.bat` or `build\build.bat` in a `cmd` window. For macOS/Linux it's `cd <worker> && bash build/build.sh`.

If the user gets stuck, the most common cause is a missing system Python. Direct them to install Python 3.11+ from python.org and re-run.

## Size

A bare-bones worker is ~15–20 MB. With heavy deps (e.g., `lxml`, `pypdf`, an LLM client) you're at 40–60 MB. That's the baseline price of "no runtime to install on the recipient's machine." If size becomes a real problem the answer is probably a compiled-language rewrite — out of scope for v1.

## Signing

Code-signing requires a certificate and is out of scope for v1. The README the forge produces should note that:

- **Windows.** Running an unsigned `.exe` triggers SmartScreen the first time. "More info → Run anyway" is the right path.
- **macOS.** Running an unsigned `.app` triggers Gatekeeper. Right-click → Open works; the standard double-click does not until the user has approved the binary once.
- **Linux.** No equivalent prompt; the user needs to `chmod +x` the artifact if it isn't already executable.

This is acknowledged ugly behavior that future versions will fix via code-signing.
