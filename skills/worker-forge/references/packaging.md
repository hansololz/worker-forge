# Packaging

The packaging phase turns the Python source in `build/` into a native artifact the user can double-click. The artifact lands in `dist/`.

Cross-compilation is out. A Windows `.exe` is built on Windows, a macOS `.app` on macOS, a Linux AppImage on Linux. You picked the target OS during the interview; that decision drove which build script you copied into `build/`. Now you either run the matching build script (if your host OS matches the target and the user has approved) or you hand it to the user with instructions.

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

## Handing off the artifact

After a successful build, the user gets two things:

- The artifact in `dist/`. Link them to it with `computer://<absolute-path-to-artifact>`.
- The full Workspace. They can audit the source, hand it to someone else, or come back later for a reforge.

Don't bury the artifact path in prose. Give the user a one-line link they can click.
