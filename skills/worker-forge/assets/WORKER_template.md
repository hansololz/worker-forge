---
name: { WORKER_NAME }
description: { ONE_LINE_DESCRIPTION }
target_os: { TARGET_OS }
trigger: { TRIGGER }
---

# {WORKER_NAME}

{FULL_DESCRIPTION}

## What it touches

- **Reads:** {READS}
- **Writes:** {WRITES}
- **Network:** {NETWORK}

## Trigger

{TRIGGER_DETAILS}

## Cascade plan

{CASCADE_PLAN}

## How to run

{RUN_INSTRUCTIONS}

## First run

The first time the worker needs a local model or a hosted API key, it walks
you through setup in the console. Those settings get saved to
`%APPDATA%\worker-forge\{WORKER_NAME}\config.json` (Windows) or
`~/.config/worker-forge/{WORKER_NAME}/config.json` (macOS / Linux) so you
only set them up once.

## Notes

- The artifact in `dist/` is unsigned. On Windows, SmartScreen may warn you
  on first run — choose "More info → Run anyway." On macOS, right-click →
  Open and approve in System Settings → Privacy & Security.
- To rebuild after editing: run `build/{BUILD_SCRIPT}` from this folder.
