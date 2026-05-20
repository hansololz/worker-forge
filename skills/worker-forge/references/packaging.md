# Packaging a worker

PyInstaller produces a binary for the platform it runs on; it can't cross-compile. So the build needs to happen on a
machine that matches the target OS chosen in the interview.

This document covers what the worker folder looks like, the per-OS build scripts, and the ask-before-build flow.

## What the worker project looks like

A forged worker is a Python project inside the Workshop:

```
workshop/workers/<worker-name>/
├── WORKER.md         # plain-language spec
├── AUTHORING.md      # interview notes, decisions
├── main.py           # task logic
├── worker_runtime.py # cascade runtime, copied unchanged from assets/
├── requirements.txt
├── resources/        # prompts, schemas, sample inputs
├── build/
│   └── build_<os>.{bat,sh}
└── dist/             # populated by the build step
```

`build/` holds one script for the target OS. The script creates a venv, installs deps, and runs PyInstaller with
`--onefile --console`. Output lands in `dist/`.

## Per-OS build scripts

The skill's `assets/` folder holds three:

- `build_windows.bat` — runs PyInstaller on Windows. Output: `dist/<name>.exe`.
- `build_macos.sh` — runs PyInstaller on macOS. Output: `dist/<name>` (executable). Add `.app` packaging only if the
  user asks; `.app` is heavier and not needed for a console worker.
- `build_linux.sh` — runs PyInstaller on Linux. Output: `dist/<name>` (executable).

The scaffolder copies the right script into the worker's `build/` folder based on `--target-os`. The user gets exactly
one build script per worker.

## PyInstaller flags worth knowing

All three build scripts use the same flags:

- `--onefile` — bundle everything into one binary. The "one file is the default" principle made literal. Trade-off:
  PyInstaller unpacks to a temp dir on first run, adding ~1s startup. Worth it for shareability.
- `--name <worker-name>` — the artifact's name.
- `--console` — keep a console window. Workers print status and prompt for first-run setup (API key, model picker).
  `--noconsole` breaks first-run UX.
- `--icon <path>` — optional. Skip unless the user provided one.

If you find yourself wanting `--noconsole` to make the artifact "look nicer," stop. Workers are tools, not apps.

## The ask-before-build flow

Always ask the user before invoking a build. Two reasons: builds take a minute or two and pull dependencies, and the
user may want to inspect the source first. Use `AskUserQuestion` with concrete options.

After confirmation, branch on whether the host OS matches the target OS:

### Host matches target → run the build yourself

Run the build script from the worker's folder. Stream the output so the user sees progress. Common failure modes:

- **Python not on PATH.** Surface the error message and tell the user to install Python 3.11+ from python.org (Windows)
  or via the system package manager (macOS / Linux).
- **Permission denied on the .sh script** (macOS / Linux). Tell the user to `chmod +x build/build_<os>.sh` and retry.
  Better: the scaffolder should `chmod +x` at scaffold time.
- **PyInstaller can't find a hidden import.** Add `--hidden-import <module>` to the build script and retry.

On success, hand the user a `computer://` link to the artifact in `dist/`.

### Host doesn't match target → hand off the script

Don't try to cross-compile. Hand the user the path to the build script and one-line instructions:

- Windows target: "Double-click `build/build_windows.bat` on a Windows machine. The artifact will be at
  `dist/<name>.exe`."
- macOS target: "Run `./build/build_macos.sh` from this folder on a macOS machine. The artifact will be at
  `dist/<name>`."
- Linux target: "Run `./build/build_linux.sh` from this folder on a Linux machine. The artifact will be at
  `dist/<name>`."

Then offer to walk through any first-time setup their target machine might need.

### User declines → leave source in Workshop

If the user says "not now," don't push. The source is in the Workshop; they can run the build script themselves, or come
back later and ask the Forge to retry. Make sure they know both paths.

## Dependencies

Common pinned libraries for `requirements.txt`:

- `requests` — HTTP. Almost always.
- `pypdf` — PDF text extraction.
- `feedparser` — RSS/Atom feeds.
- `beautifulsoup4` + `lxml` — HTML scraping.
- `anthropic` / `openai` — only if the worker can escalate to hosted LLM. The runtime uses raw `urllib` so these aren't
  strictly required.
- `ollama` — Python client for Ollama. Optional; the runtime falls back to raw HTTP to `localhost:11434`.

Pin specific versions when you can. Workers are frozen artifacts — a version that worked at forge time should keep
working.

## Size

A bare-bones worker is ~15-20 MB. With heavy deps (lxml, pypdf, an LLM client) you're at 40-60 MB. That's the price of "
no runtime to install on the recipient's machine." If size becomes a real problem, the answer is a compiled-language
rewrite — out of scope for v1.

## Signing

Code-signing is out of scope for v1.

- **Windows.** The first run of an unsigned `.exe` triggers SmartScreen. The right path is "More info → Run anyway."
  Note this in `WORKER.md` or the run instructions.
- **macOS.** The first run of an unsigned binary requires the user to right-click → Open, then approve in System
  Settings → Privacy & Security. Same drill — note it.
- **Linux.** No signing prompt. The artifact needs `chmod +x`.

Future versions will fix this with code-signing certificates. For v1 the user accepts a one-time warning per target.
