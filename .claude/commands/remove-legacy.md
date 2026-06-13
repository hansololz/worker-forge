---
description: Remove legacy code, old references, and migration handlers (assume a fresh install)
allowed-tools: Bash(grep:*), Bash(rg:*), Bash(find:*), Bash(git status:*), Bash(git diff:*), Bash(python:*), Bash(ruff:*), Bash(node:*), Bash(sed:*), Read, Edit, Write, Grep, Glob
---
Remove legacy code from this project. **Assume a fresh install**: there is no old data, config, or
deployed version to stay compatible with, so backward-compatibility and data migration are unnecessary.

Optional scope: `$ARGUMENTS` (a subsystem, file, term, or removed feature to focus on). If empty, sweep
the whole real source tree (`backend/app`, `src`, `electron`, `scripts`) — never `node_modules` or `.venv`.

**Never modify the `design/` directory or `scripts/import-design.sh`** — these are an upstream-owned
design reference and its import script; leave them untouched regardless of scope.

1. **Find candidates.** Search for: migration handlers; back-compat shims (e.g. pydantic `extra=ignore`
   for stray keys, dual dict/object handling, optional fields kept only for old payloads); defensive
   fallbacks for formats/engines that the shipped stack always satisfies; try/except that only catches an
   old shape; references to renamed or deleted things (status values, files, globals, config keys); and
   prototype/scaffold remnants. Useful markers: `legacy|deprecat|back.?compat|backward|fallback|migrat|
   \bold[_ ]|shim|for now|temporar`.

2. **Separate legacy from live features.** A keyword hit is NOT automatically legacy. Do **not** remove:
   workflow/task **versioning** (`latest_version`, "old version's cron", superseded versions); comments
   that document **intentional** no-migration behavior ("history is NOT migrated"); or sensible defaults
   (unknown-timezone → `UTC`). These describe current design, not dead code. When a target is genuinely
   ambiguous — it could be load-bearing — ask before deleting rather than guess.

3. **Remove it.** Delete the dead code/handlers and the now-dangling references to them (stale comments,
   imports, doc pointers). Keep the change focused; don't refactor unrelated code.

4. **Keep `SPEC.md` in sync.** `SPEC.md` is the source of truth and must still describe a buildable app.
   Repoint or drop any spec prose that referenced what you removed.

5. **Verify.** Backend: `python -c "import app.main"` from `backend/` (venv active) + `ruff check app` —
   confirm no NEW errors vs. baseline. Frontend: `node --check` a `.js` copy of any edited `.jsx`
   (this codebase uses `e(...)` hyperscript, not JSX tags). Confirm no leftover references remain.

6. **Report** concisely: what was removed, what was deliberately kept (and why), and the verification
   result. Do not commit — leave changes in the working tree for review.
