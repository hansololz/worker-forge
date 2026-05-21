# {WORKER_NAME}

{ONE_LINE_DESCRIPTION}

## What it does

{FULL_DESCRIPTION}

## What it touches

- **Reads:** {READS}
- **Writes:** {WRITES}
- **Network:** {NETWORK}

## How to build

This folder is a Python project. To produce the {ARTIFACT_NAME}:

1. Make sure Python 3.11 or newer is installed. ([python.org](https://python.org/))
2. {BUILD_INSTRUCTION}
3. When it finishes, your worker is at `{ARTIFACT_PATH}`.

You can run that artifact directly or hand it to someone else — it's self-contained.

## How to run

{RUN_INSTRUCTIONS}

## First run

The first time the worker needs a local model or a hosted API key, it walks you through setup in the console. Those settings get saved (in the OS keyring when available, otherwise in `{CONFIG_PATH}`) so you only set them up once.

## A note about unsigned binaries

v1 workers are not code-signed. {OS_WARNING}

## Reforging

To change what this worker does:

1. Edit `main.py` (the task logic), `WORKER.md` (the spec), or both.
2. Note the change rationale in `AUTHORING.md` under a new dated heading.
3. Re-run the build script.

`WORKER.md`'s cascade plan is the source of truth for which tier handles which unit. If you change a tier, update the table.
