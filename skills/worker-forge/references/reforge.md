# Reforge

A reforge modifies an existing worker rather than producing a new one. It's the common case after the first build — the
user runs the worker, finds an edge case the spec missed, and wants the worker updated. A worker that can't be reforged
from its own `WORKER.md` and `AUTHORING.md` is a worker that failed the interview phase.

## When it's a reforge vs. a fresh forge

Reforge when:

- The user points at an existing worker folder.
- The change is incremental: a new edge case, a different output path, swapping a tier in one cascade unit.

Fresh forge when:

- The user describes a different task. (Two tasks means two workers.)
- The change is sweeping enough that the cascade plan is no longer recognizable. In this case, archive the old folder
  under `workshop/workers/<name>/history/<timestamp>/` and start over.

If you're not sure, treat it as a reforge. The cost of an unnecessary patch is small; the cost of throwing away
`AUTHORING.md` and re-interviewing is high.

## The reforge cycle

### 1. Load context

Read `WORKER.md` and `AUTHORING.md` in full. They are the spec and the rationale. Do not re-interview from scratch — the
user already answered those questions, and asking again wastes their time and signals that the Forge can't be trusted to
remember.

If the change request is ambiguous, ask only the questions you need to disambiguate it. Use `AskUserQuestion`.

### 2. Identify the affected unit

The cascade plan in `WORKER.md` lists units by name. Find the one (or two) the change touches. Most reforges are
single-unit changes.

If the change spans every unit, that's a signal the request might actually be a different task. Pause and check.

### 3. Make the change

Modify `main.py`. Keep the change small — don't refactor adjacent units. The runtime (`worker_runtime.py`) is never
modified in a reforge.

If the change adds a new dependency, update `requirements.txt`. If it changes what the worker reads or writes, update
`WORKER.md`.

### 4. Update the docs

- **`WORKER.md`.** Update the cascade table if a tier changed, and update the description if the worker's job
  description changed.
- **`AUTHORING.md`.** Append a short dated note: what changed, why, what was considered. This is the audit trail. Future
  reforges read it.

```markdown
## 2026-05-19 reforge

User reported that PDFs with `Statement Date:` rather than ISO dates were skipped.
Added `Statement Date: <date>` to the regex set in the CODE tier. Local model
fallback unchanged.
```

### 5. Rebuild

Phase 4 from the main forge cycle: ask the user before invoking the build, build if your host matches the target,
otherwise hand them the build script. See `packaging.md`.

## What not to do

- **Don't re-interview from scratch.** Every question you ask again is a question the original interview should have
  covered. If you have to re-interview, the original `AUTHORING.md` was incomplete — fix it.
- **Don't rewrite the cascade for elegance.** Reforge changes one unit. Cascade-wide rewrites are a fresh forge.
- **Don't skip the `AUTHORING.md` note.** A reforge without an audit trail makes the next reforge harder.
- **Don't touch `worker_runtime.py`.** The runtime is shared infrastructure. If a runtime bug needs fixing, fix it in
  the skill's `assets/worker_runtime.py` and re-scaffold workers that need the fix.
