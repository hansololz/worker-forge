# Packaging

The packaging phase turns the Python source in `build/` into a native artifact the user can double-click. The artifact lands in `dist/`.

Cross-compilation is out. A Windows `.exe` is built on Windows, a macOS `.app` on macOS, a Linux AppImage on Linux. You picked the target OS during the interview; that decision drove which build script you copied into `build/`. Now you either run the matching build script (if your host OS matches the target and the user has approved) or you hand it to the user with instructions.

## Distribute as a single binary

The default deliverable is one self-contained binary the recipient can run without installing Python, without `pip install`, without anything. PyInstaller `--onefile` (or its py2app equivalent for a `.app` bundle) is the right shape for almost every worker, and it's what the build scripts default to. The reason: a worker that needs the recipient to have Python 3.11 or a specific pip wheel is a worker the recipient won't actually run.

The only external dependencies that are generally OK to require are the ones that *can't* be bundled and are intrinsic to the worker's purpose:

- A local-model runtime (Ollama, the platform's built-in inference) when the cascade has a LOCAL unit.
- The hosted provider's API endpoint when the cascade has a HOSTED unit.

Anything else — system Python, a database server the worker drives, a CLI tool the worker shells out to — is a yellow flag. Either pull it into the binary, replace it with something that can be bundled, or surface it to the user during the interview as a "this worker requires X on the machine" decision they explicitly signed off on. Don't quietly ship a worker that needs a dependency the recipient doesn't know about.

## Fetch the minimum necessary from the network

The worker should pull the smallest amount of data online that it can to do its job. Two reasons: it's faster, and it's less surface for a partial failure (a 200-MB download that dies at 80% is a worse failure mode than five 5-MB downloads where you can resume from the one that broke). Concretely:

- Pull the smallest model that satisfies the task — `llama3.2:3b` before `llama3.1:8b`, `8b` before `70b`. Bigger models are slower to download *and* slower at run time.
- Cache anything the worker reuses (model weights, RSS feed bodies, parsed schemas) in the data directory the user picked during the interview. The runtime helpers already do this for model weights; do the same for any HTTP fetches the worker makes more than once.
- For HOSTED units, send only the slice of the input the model actually needs. Don't ship the whole document if a paragraph will do.

The exception is when the user asked for the bigger thing — "summarize the whole repo, not just the README." Honor that and note it in `AUTHORING.md` so the next reforge knows why the worker is heavier than the default would be.

## Per-OS build details

### Windows → `.exe` via PyInstaller

Build script: `build_windows.bat` (copied from `assets/`).

The script:

1. Creates a venv in `build/.venv`.
2. `pip install -r requirements.txt pyinstaller`.
3. `pyinstaller --onefile --name <worker-name> --noconsole main.py` (drop `--noconsole` for CLI workers — without it a console worker pops a window briefly).
4. Copies the resulting `.exe` from `build/dist/` to the Workspace's top-level `dist/`.

PyInstaller flags worth knowing:

- `--onefile` — single binary, slower startup but easier to distribute. Default for workers.
- `--noconsole` — hide the console window. Use for GUI workers; skip for CLI workers.
- `--icon=resources/icon.ico` — if the user provided an icon.
- `--add-data "resources;resources"` — bundle the `resources/` folder. Use a semicolon on Windows, a colon on macOS/Linux.

PyInstaller is the safe default on Windows. Nuitka produces faster binaries but the trade-off (slower build, occasional compatibility issues with C extensions) isn't worth it for most workers.

### macOS → `.app` via py2app or PyInstaller

Build script: `build_macos.sh`.

py2app produces a more native-feeling `.app` (better Finder integration, proper Info.plist, optional code-signing hook). PyInstaller works too and the script is simpler — default to PyInstaller unless the user asked for a real app bundle.

The script:

1. Creates a venv.
2. `pip install -r requirements.txt pyinstaller` (or `py2app`).
3. `pyinstaller --onefile --windowed --name <worker-name> main.py` — `--windowed` is the macOS equivalent of `--noconsole`.
4. Copies the artifact to the top-level `dist/`.

Unsigned `.app` bundles trigger Gatekeeper on first launch ("can't open because Apple cannot check it for malicious software"). The user can right-click → Open the first time to bypass. Note this in `WORKER.md`'s setup section — recipients hit this and it looks like the worker is broken.

### Linux → AppImage or static binary

Build script: `build_linux.sh`.

Two reasonable shapes:

- **PyInstaller --onefile.** Produces an ELF binary. Works fine for headless workers. The user runs `./<worker-name>`. Simplest path.
- **AppImage.** Wrap the PyInstaller output with `appimagetool`. The user gets a single `.AppImage` they can mark executable and run. Best for GUI workers and for users who like the "double-click an icon" experience.

Default to PyInstaller `--onefile` unless the user explicitly wants an AppImage. The AppImage path needs `appimagetool` on the build host; the script checks for it and falls back to plain PyInstaller if it isn't there.

## When the host OS doesn't match the target

This is a normal branch, not an error. The supplement spec says to offer to build if possible and to leave a clear message saying why not if it isn't. Concretely:

- If the host OS matches the target → ask the user "OK to run the build now?", and if yes, run `build/build_<os>.{bat,sh}` from the Workspace. Stream the output. When it finishes, link them to `dist/<worker-name>.<ext>` with a `computer://` URL.
- If the host OS doesn't match the target → don't try to cross-compile. Leave the build script in `build/` and tell the user something like:

  > "I can't build this from here — you picked Windows as the target and I'm running on Linux. The build script is at `<workspace>/build/build_windows.bat`. Run it on a Windows machine and you'll get the `.exe` in `<workspace>/dist/`."

  Put the same note at the bottom of `WORKER.md` so it survives past the chat.

## When the user declines the build

If the user says no to the build prompt, leave the source in `build/` with a note in `WORKER.md` explaining what to run. They can come back later and ask you to retry the build, or they can run the script themselves.

This isn't a failure — it's a known branch of the forge. Don't apologize for it, just hand off cleanly.

## After a successful build

Sanity-check the output:

- Is there a file at `dist/<worker-name>.<ext>`?
- Does it have a reasonable size (PyInstaller `--onefile` artifacts are usually 10–40 MB; an under-1-MB binary almost always means something went wrong)?
- For Windows / Linux: does it run? `--onefile` binaries can fail on first invoke for missing data files; smoke-test by running it once if the worker is safe to invoke.
- For macOS: same, plus note the Gatekeeper bypass step in `WORKER.md`.

If the smoke test fails, read the error and patch the cascade or the build script. Common failures:

- `ModuleNotFoundError` after build — a dependency that's imported dynamically wasn't picked up by PyInstaller's analysis. Add it explicitly in `requirements.txt` or use `--hidden-import=<name>`.
- `FileNotFoundError` on a resource — the file is in the source tree but wasn't bundled. Add it with `--add-data`.
- Permission denied on first run (Linux) — the binary needs `chmod +x`. Document it in `WORKER.md`.

## Security review

Workers run with the recipient's privileges on the recipient's machine, touch their files, and sometimes their network. A small security pass at code-gen time and a second one before handoff catches the easy mistakes before they ship.

**As you create each script** (`build/main.py`, any helper, any build script, anything in `resources/`), give it a quick read with these questions in mind:

- Are all inputs from the outside (CLI args, files the worker reads, HTTP responses, model output) sanitized before they're used in a path, a shell command, a SQL string, or an HTML/Markdown render? Use `pathlib` + a path-traversal check for file paths, parameterized queries for SQL, `shlex.quote` (or skip the shell entirely with `subprocess.run([...], shell=False)`) for shell calls.
- Are inputs restricted to only what the unit needs? A unit that only reads `.txt` files in one folder shouldn't accept an arbitrary path. A unit that calls one API endpoint shouldn't be reachable for other endpoints.
- Are secrets (API keys, tokens) sourced from the keyring or env vars and never written to disk in plaintext or logged on error?
- Are file writes scoped to the data directory the user picked in the interview? A worker that scribbles outside its own dir is the kind of thing recipients (rightly) complain about.

Fix anything you find before moving on to the next script. It's cheaper to fix the regex while you're looking at it than to come back during the final pass.

**Before you offer to build**, do one more pass over the whole Workspace as a unit. Things you only catch at this level:

- Two units that are individually safe but compose into something unsafe (one fetches a URL from a config, another uses the response as a filename — that's a path-traversal vector that neither unit owns).
- A `resources/` file the worker no longer uses but that still ships with the binary (delete it — it's just attack surface).
- A `requirements.txt` entry the code no longer imports (same — drop it; smaller bundle, fewer CVEs to inherit).
- A debug flag, a `print(api_key)`, a hard-coded test path that snuck in during code-gen.

Note any non-trivial finding in `AUTHORING.md` under "Decisions and reasoning" so the next reforge has the context. If you find something you can't fix without re-interviewing the user (the worker fundamentally needs broader filesystem access than the user originally signed off on), flag it and ask before you ship.

## Handing off the artifact

After a successful build, the user gets two things:

- The artifact in `dist/`. Link them to it with `computer://<absolute-path-to-artifact>`.
- The full Workspace. They can audit the source, hand it to someone else, or come back later for a reforge.

Don't bury the artifact path in prose. Give the user a one-line link they can click.
