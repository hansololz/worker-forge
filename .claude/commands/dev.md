---
description: Run worker-forge in development via scripts/dev.sh (electron-vite + backend, hot reload)
allowed-tools: Bash(bash scripts/dev.sh:*)
---

# Run worker-forge in dev

`scripts/dev.sh` bootstraps the backend virtualenv + node deps, then launches electron-vite with
hot reload. Electron's main process spawns the backend itself (from `backend/.venv`, on a free
loopback port).

Communicate using the `/caveman` skill with `lite` settings for the whole run (project rule).

## Run it

- `bash scripts/dev.sh`
- It is **long-running** (the dev server stays up until stopped) — run it in the background and
  leave it running; don't wait for it to exit.
- First run installs deps, so it may take a while before the window appears.

## Report

Caveman lite: confirm it launched (backend port + electron window up), or quote the shortest
failing line if it didn't.
