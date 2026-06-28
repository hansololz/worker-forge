---
description: Detect where the design/ prototype lags behind SPEC.md and update design/ to match the spec
allowed-tools: Bash(git log:*), Bash(git show:*), Bash(git diff:*), Bash(git status:*), Read, Grep, Glob, Edit, Write
---

# Update the design prototype to match SPEC

`SPEC.md` is the **source of truth** for what the app does. The `design/` directory is a
static React-via-Babel prototype (mock `window.DB` data, `React.createElement` aliased `e`,
`styles.css` tokens, `README.md` design spec) showing the intended look + behavior. Normally a
designer ships `design/` and the app follows (`/apply-design`). This command is the **reverse**:
when the app's behavior moved ahead in `SPEC.md` and `design/` drifted **behind**, bring the
prototype back in line with the spec.

> This command **intentionally edits `design/`** — that is its whole job. (The "don't touch
> design/" rule in other commands does not apply here; the user is explicitly asking for it.)

Communicate using the `/caveman` skill with `lite` settings for the whole run (project rule).

## 1. Find the drift

- Establish recency: `git log --oneline -10 -- SPEC.md` and `git log --oneline -10 -- design/`.
  If `design/` was last touched before the relevant SPEC changes, that's the drift window.
- Read `SPEC.md` as the authority for features, view layouts, status vocabularies, params,
  and copy. Read the `design/` files that mirror each area:
  - `design/views-workflows.jsx`, `views-tasks.jsx`, `views-runs.jsx`, `views-triggers.jsx`,
    `views-settings.jsx` → their SPEC view sections.
  - `design/styles.css` → tokens / status colors in `SPEC.md` + `design/README.md`.
  - `design/README.md` → the design's prose spec (must describe the same app SPEC.md does).
  - `design/data.js` / `orchestrator-data.js` → mock data shapes vs SPEC §4 models.
- List concrete mismatches: a feature/field/status/control in SPEC that the prototype is missing,
  renamed, or shows differently. Be specific (file + what's stale + what SPEC says).

If `$ARGUMENTS` names a view, feature, section, or file, scope the drift hunt to that only.

## 2. Understand before editing

- For each mismatch, read the SPEC section **in full** and the corresponding design file in full
  context — not just the stale line. Know how the change fits the prototype's layout + data flow.
- Decide the prototype-faithful representation: match the design's existing conventions
  (`e(...)` hyperscript, `window.DB` mock data, the OKLCH tokens in `styles.css`/README), not the
  real app's JSX. The prototype must still run as a zero-build single-file preview.
- State plainly what's stale and what you'll change before touching anything.

## 3. Update design/ to the spec

- Edit the prototype files so they reflect SPEC: add the missing control/field/status, fix renamed
  vocabulary, update mock data + copy. Keep it pixel-faithful to the existing design language
  (tokens, spacing, status colors) — you are extending the prototype, not redesigning it.
- Keep `design/README.md` in sync — it is the design's spec prose; update the affected description
  so README still matches both `SPEC.md` and the prototype files.
- Change only what the drift requires. Don't redesign or refactor unrelated prototype code.

## 4. Verify

- Sanity-check edited `.jsx`/`.js` prototype files parse (e.g. `node --check` a `.js` copy —
  the prototype uses `e(...)` hyperscript, not JSX tags).
- Confirm no stale reference to the old shape remains in `design/` (grep the renamed term).

## 5. Report

Caveman lite: the drift found (SPEC vs design), which `design/` files you updated, and any spec
detail you couldn't faithfully map into the prototype (with why). Do not commit unless asked.
