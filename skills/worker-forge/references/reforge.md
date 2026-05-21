# Reforge

Reforging is the common case after the first build. The user comes back with a change request — the format shifted, an edge case showed up, the output needs a new field — and the forge updates the worker in place rather than starting over. Reforge is what makes a worker durable: a one-line change should not require a fresh interview.

## What makes a reforge possible

Two files in every worker folder:

- **`WORKER.md`** — the spec. Metadata (name, description), trigger, cascade plan, input/output contract.
- **`AUTHORING.md`** — the rationale. Interview notes, decisions, alternatives considered and rejected.

A reforge starts by reading both. `WORKER.md` tells the forge what the worker does today. `AUTHORING.md` tells the forge *why* it does it that way. The combination is what lets the forge change one unit without breaking the rest.

If a worker can't be reforged from its own `AUTHORING.md`, the original interview was too thin. Fix the interview next time; for now, do whatever it takes (reinterview, infer from code, ask the user) to produce a reforge that holds together.

## The reforge flow

1. **Read the worker folder.** `WORKER.md`, `AUTHORING.md`, `main.py`. Note the target OS — it doesn't change in a reforge.

2. **Confirm the change with the user.** Quote the part of `WORKER.md` that's about to change, and the proposed new wording. Wait for confirmation.

3. **Identify the affected cascade units.** Most reforges touch one unit. If the change reshuffles two or more units, that's still a reforge — but if it reshuffles all of them, see "When to do a fresh forge" below.

4. **Modify the affected units.** Update `main.py`. Update the cascade table in `WORKER.md` if a tier choice changed.

5. **Append to `AUTHORING.md`.** Under a new dated heading:

   > ## 2026-05-21 — Reforge: switch dedupe to content hash
   > 
   > **Change request.** "I want to re-process files when I re-download them. The current filename dedupe skips them."
   > 
   > **Old behavior.** Dedupe by filename in `~/.config/worker-name/seen.json`.
   > 
   > **New behavior.** Dedupe by SHA-256 of file contents.
   > 
   > **Why.** Original rationale was "user wants to re-process re-downloads" — but the implementation went the other way. Filename-based dedupe was wrong.
   > 
   > **Tier.** Still CODE; `hashlib.sha256` is a one-liner.

6. **Ask for permission to rebuild.** Same prompt as the initial forge. If yes and host OS matches the target, run the build script. Otherwise hand the script to the user.

## When to do a fresh forge

If the change is large enough that a patch is messier than a redo, throw out the old worker and forge a new one. Signals:

- The input format changes (was a folder, now a webhook).
- The trigger changes (was a click, now a schedule).
- The output shape changes enough that the cascade plan no longer fits.
- More than half the cascade units are touched.

Before overwriting, preserve the old context:

```
<worker>/history/2026-05-21/
├── AUTHORING.md
├── WORKER.md
└── main.py
```

The history folder is so a future forge can read the prior design — sometimes a "fresh" forge is actually two reforges that disagree, and the history clarifies which one to trust.

## Reforging across OS targets

A worker built for Windows can be reforged into a worker for macOS, but it requires:

- Auditing the `main.py` for OS-specific paths (`%APPDATA%`, `\\`, `\r\n`, etc.).
- Swapping the build script.
- Rebuilding on a matching host.

Most OS-specific code lives in the runtime, not `main.py`, so this is usually shallow. If a worker's `main.py` is OS-aware in non-trivial ways, that's a design smell — surface it to the user before reforging.

## What reforge does not do

- **Reforge does not change the cascade-tier philosophy.** Cheaper tier first is permanent. A reforge can move a unit from LOCAL to HOSTED if LOCAL is unreliable, but it does not pre-emptively put a model call where code would do.
- **Reforge does not silently widen scope.** If the user asks for "one more thing," ask whether the result is one worker or two. The single-responsibility rule applies on every reforge.
- **Reforge does not regenerate from scratch without preserving history.** Even a full redo writes the old worker into `history/<date>/`.
