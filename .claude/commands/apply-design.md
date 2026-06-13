---
description: Find the most recent design changes in design/, understand them, and apply them faithfully to the app
allowed-tools: Bash(git log:*), Bash(git show:*), Bash(git diff:*), Bash(git status:*), Read, Grep, Glob, Edit, Write
---

# Apply latest design changes to the app

The `design/` directory is a **static React-via-Babel prototype** — the source of truth for
visual look and interaction (see `design/README.md` for tokens + spec). The real app lives in
`src/` (React + JSX). A designer ships updates by dropping a new bundle that overwrites `design/`,
committed as **"Updated design"**. Your job: find the newest design changes, understand the intent,
and recreate them **pixel-accurately** in `src/` using the app's existing components and patterns.

Communicate using the `/caveman` skill with `lite` settings for the whole run (project rule).

## 1. Find the most recent design changes

- `git log --oneline -15 -- design/` to see recent design commits.
- Identify the newest **"Updated design"** commit(s). Show the diff:
  `git show <sha> -- design/` (include every changed design file).
- Also check the working tree for uncommitted design edits: `git status --short -- design/`
  and `git diff -- design/`.
- Scan the changed design files for **inline annotation comments** the designer left to flag
  intent (e.g. `// CHANGE:`, `// NEW:`, `// NOTE:`, `// TODO:`, review notes). Grep the touched
  files for comment markers and read the surrounding code.

If `$ARGUMENTS` names a specific commit, file, view, or feature, scope to that instead of the
latest commit.

## 2. Understand them

- Read each changed design file **in full context**, not just the diff hunk — understand how the
  change fits the surrounding component, layout, and data flow.
- Cross-reference `design/README.md` for the design tokens, status semantics, and the spec text
  describing the affected view.
- Map the design's prototype constructs to their real-app equivalents:
  - `React.createElement` (aliased `e`) / mock `window.DB` data → app's JSX components + real
    data layer (`src/model.js`, `src/api.js`).
  - design tokens / `design/styles.css` → the app's theming in `src/index.css`.
  - prototype views (`design/views-*.jsx`) → `src/views/`.
- State plainly what changed and what it implies for the app before editing.

## 3. Follow them closely

- Treat the design as **high-fidelity**: match colors, typography, spacing, radii, shadows,
  status colors, and interactions exactly. Prefer the OKLCH tokens from the README.
- Reuse the app's established components, routing, and state — do **not** copy the prototype's
  `e(...)` calls, mock data, or hand-rolled router verbatim.
- Change only what the design change requires. Don't refactor unrelated code.

## 4. Apply to the app

- Make the edits in `src/`.
- Verify the touched views still build/typecheck if a quick check is available.
- Per project rule, capture the feature change in `SPEC.md` (source of truth) — update the
  relevant section so SPEC.md still describes the app accurately.

## 5. Report

Summarize, caveman lite: which design commit, what changed, which `src/` files you touched, and
any design detail you couldn't fully map (with why). Do not commit unless asked.
