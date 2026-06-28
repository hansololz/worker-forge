---
description: Import the latest design bundle from ~/Desktop/workflow.zip into design/ via scripts/import-design.sh
allowed-tools: Bash(bash scripts/import-design.sh:*), Bash(git log:*), Bash(git show:*), Bash(git status:*)
---

# Import a design bundle into design/

`scripts/import-design.sh` unzips `~/Desktop/workflow.zip`, flattens the bundle into `design/`
(overwriting matching files), deletes the archive + temp dir, and **commits the result as
"Updated design"**. It is upstream-owned — run it, never edit it.

Communicate using the `/caveman` skill with `lite` settings for the whole run (project rule).

## 1. Run the import

- `bash scripts/import-design.sh`
- If it fails because `~/Desktop/workflow.zip` is missing or `unzip` isn't on PATH, report that
  plainly and stop — don't try to work around it.

## 2. Report

Summarize, caveman lite: how many files imported, which design files changed (`git show HEAD --stat`),
and the commit it made. The script already commits — do not commit again.

Note: this only refreshes `design/`. To recreate the changes in the real app (`src/`), run
`/apply-design` next.
