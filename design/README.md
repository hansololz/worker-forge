# Handoff: Agent Dave — Workflow Orchestrator

## Overview
**Agent Dave** is a desktop-style **workflow orchestrator** — a tool for defining, scheduling, running, and inspecting automated CI/CD-style pipelines. Users assemble reusable **Tasks** (each a set of bash/python steps) into staged **Workflows**, attach **Triggers** (manual or cron), launch **Executions**, and drill into a per-run **Execution page** with stage rails, per-attempt retries, and live terminal logs.

The aesthetic is a **dark, technical "developer tool"** look — cool near-black surfaces, a single warm-orange accent, IBM Plex Sans + IBM Plex Mono, and a strict status-color system.

## About the Design Files
The files in this bundle are **design references created in HTML/CSS/React-via-Babel** — a working prototype showing the intended look, layout, and behavior. **They are not production code to copy directly.** The prototype runs React 18 through an in-browser Babel transform with `React.createElement` (aliased `e`) instead of JSX, mock data on `window.DB`, and a hand-rolled history/router — all choices made for a zero-build single-file preview, not for production.

Your task is to **recreate these designs in the target codebase's existing environment** (React + JSX, Vue, SwiftUI, etc.), using its established component library, routing, state management, and data layer. If no environment exists yet, pick the most appropriate framework and implement there. Treat the HTML as the source of truth for **visual design and interaction**, and the descriptions below as the spec.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, status semantics, and interactions are all specified. Recreate the UI pixel-accurately using the codebase's libraries, mapping the design tokens below onto its theming system.

---

## Design Tokens

All colors are authored in **OKLCH**. Hex equivalents are approximate sRGB conversions for convenience — prefer the OKLCH values if the target supports them.

### Surfaces (cool near-black, very low chroma, hue 264)
| Token | OKLCH | ~Hex | Use |
|---|---|---|---|
| `--bg-0` | `oklch(0.165 0.008 264)` | `#0d0e12` | App base / deepest (main content bg, inputs' deepest) |
| `--bg-1` | `oklch(0.205 0.009 264)` | `#15161b` | Panels, sidebar, cards, table bg |
| `--bg-2` | `oklch(0.235 0.010 264)` | `#1b1c22` | Raised cards, nodes, menu surfaces |
| `--bg-3` | `oklch(0.275 0.012 264)` | `#212329` | Hover, active nav, inputs hover |
| `--bg-4` | `oklch(0.315 0.013 264)` | `#282a31` | Active raised (toggle track) |

### Lines / borders
| Token | OKLCH | Use |
|---|---|---|
| `--line` | `oklch(0.305 0.011 264)` | Default hairline border |
| `--line-soft` | `oklch(0.255 0.010 264)` | Softer dividers, card borders |
| `--line-hi` | `oklch(0.40 0.014 264)` | Hover/emphasis border, scrollbar thumb |

### Text
| Token | OKLCH | Use |
|---|---|---|
| `--tx-hi` | `oklch(0.965 0.004 264)` | Headings, primary values |
| `--tx` | `oklch(0.86 0.006 264)` | Body text |
| `--tx-mid` | `oklch(0.70 0.010 264)` | Secondary text, nav items |
| `--tx-lo` | `oklch(0.555 0.012 264)` | Muted labels, durations |
| `--tx-dim` | `oklch(0.46 0.012 264)` | Faint labels, separators |

### Accent — warm orange
| Token | OKLCH | ~Hex | Use |
|---|---|---|---|
| `--accent` | `oklch(0.74 0.155 52)` | `#e8833a` | Primary buttons, active tab underline, links-on-hover, brand mark, code strings |
| `--accent-deep` | `oklch(0.66 0.15 50)` | — | Pressed/deep accent |
| `--accent-hover` | `oklch(0.79 0.155 52)` | — | Primary button hover |
| `--accent-dim` | `oklch(0.74 0.155 52 / 0.14)` | — | Accent tint backgrounds (chips, active pills) |
| `--accent-line` | `oklch(0.74 0.155 52 / 0.36)` | — | Accent borders, focus ring border |
| `--on-accent` | `oklch(0.24 0.05 52)` | — | Text/icon on accent fills |

### Status colors (shared chroma family) — **critical, used everywhere**
| Token | OKLCH | Meaning |
|---|---|---|
| `--st-run` | `oklch(0.74 0.14 220)` | **running** — cyan/blue |
| `--st-ok` | `oklch(0.78 0.16 152)` | **success / succeeded** — green |
| `--st-fail` | `oklch(0.68 0.19 25)` | **failed** — red |
| `--st-warn` | `oklch(0.81 0.14 80)` | **queued** — amber |
| `--st-cancel` | `oklch(0.85 0.16 100)` | **cancelled** — yellow |
| `--st-cont` | `oklch(0.72 0.17 52)` | **continued** (tolerated failure) — orange |
| `--st-queued` | `oklch(0.70 0.035 248)` | **queued** (will run) — cool slate, rendered as a **hollow ring** dot |
| `--st-skip` | `oklch(0.62 0.012 264)` | **skipped / idle** — gray |

Each status has a `*-dim` variant at `/0.15`–`/0.16` alpha for badge/pill backgrounds (e.g. `--fail-dim`, `--ok-dim`, `--cont-dim`, `--queued-dim`). Badges render as `color: <status>; background: <status>-dim`. Dots render as a solid `7px` circle of the status color — **except queued**, which is a transparent circle with `inset 0 0 0 1.6px` ring.

> **Status vocabulary** (canonical, matches the app): run / stage / task statuses are `queued · running · succeeded · failed · cancelled · skipped`; step statuses `running · succeeded · failed · skipped`; attempt statuses `running · succeeded · failed · cancelled`. A **tolerated failure** (continue-on-failure where the run still succeeds) is the run `succeeded` with `degraded: true`, and the offending task carries a `continued: true` flag rendered with the orange `--st-cont` badge/dot — `continued` is a per-task flag, **not** a status value.

### Radii
`--radius: 9px` · `--radius-sm: 6px` · `--radius-lg: 13px`. Badges/dropdown rows `6–7px`, buttons/inputs `8px`, cards `13px`, modal `14px`.

### Shadows
- `--shadow-1`: `0 1px 2px oklch(0 0 0 / 0.4)`
- `--shadow-2`: `0 8px 24px -8px oklch(0 0 0 / 0.55), 0 2px 6px oklch(0 0 0 / 0.3)` (card hover lift)
- `--shadow-pop`: `0 18px 50px -12px oklch(0 0 0 / 0.7), 0 4px 12px oklch(0 0 0 / 0.4)` (menus, modals, toast)

### Terminal surfaces (darker than bg-0)
`--term-bg: oklch(0.13 0.008 264)` · `--term-row: oklch(0.16 …)` · `--term-row-hover: oklch(0.17 …)`.

### Typography
- **Sans:** `"IBM Plex Sans"`, system-ui fallback — weights 400/450/500/600/700. Base `14px`, line-height `1.5`, antialiased, `text-rendering: optimizeLegibility`.
- **Mono:** `"IBM Plex Mono"` — weights 400/500/600. Used for IDs, code, params, durations, badges, cron cells, log lines.
- Both loaded from Google Fonts.
- Type scale: page H1 `22px/600/-0.02em`; card H3 `14px/600`; section titles `12px/600` uppercase `0.07em`; nav labels `10.5px/600` uppercase `0.09em`; meta keys `10px/600` uppercase; body `13–14px`; small/mono `11–12.5px`.

### Layout
- Sidebar width `--nav-w: 232px`. App is a CSS grid `[--nav-w] 1fr`, full `100vh`, `overflow: hidden`.
- Main = flex column: topbar (`52px`, holds breadcrumbs) + scrollable `.content`.
- Page container: `max-width: 1120px; margin: 0 auto; padding: 26px 30px 80px`.
- **Density tweak:** `:root[data-density="compact"|"roomy"]` adjusts paddings/row heights across nav, pages, cards, rows, nodes, pipeline. Default is neither attribute set.

---

## Navigation & Shell

**Sidebar** (`--bg-1`, right border `--line-soft`):
- Brand block: `26px` rounded-`7px` orange mark with a `hammer` icon + wordmark "Agent **Dave**" (the "Dave" in accent). Top padding `56px` clears macOS traffic lights (this is framed as a desktop app under `titleBarStyle: hiddenInset`; `-webkit-app-region: drag` on the brand + empty topbar makes them window-drag handles).
- Nav group **Orchestration**: Workflows, Tasks, Executions. Each item has an icon, label, and a mono **count pill** (Workflows → workflow count, Tasks → task count).
- Footer group (pinned to bottom, top border): **Settings**.
- Item states: default `--tx-mid`; hover `--bg-2`/`--tx`; active `--bg-3`/`--tx-hi` with the **icon tinted accent**.

**Topbar:** breadcrumbs only (e.g. `Workflows / wf_web_release`), `13.5px`. Crumb segments: muted by default, `link` segments clickable → `--tx` on hover, `cur` (current) `--tx-hi/500`. Separator is a dim `/`.

**Global overlays:**
- **Toast:** bottom-center pill (`--bg-3`, `--line-hi`, `--shadow-pop`), check icon in accent + message, auto-dismiss ~2.4s, slide-up entrance.
- **Confirm modal:** centered `392px` card, `38px` rounded icon box (red `--fail-dim` default, amber `--warn-dim` for `tone:"warn"`), title `15.5px/600`, message `13px` (with mono `<b>`), right-aligned actions (Cancel ghost + destructive/primary confirm).

**Custom interactions worth preserving:**
- **Overlay scrollbar** (`overlay-scroll.js`): native scrollbars hidden everywhere; a floating `8px` thumb fades in while scrolling, fades out idle, draggable. No layout displacement.
- **Per-view scroll memory:** scroll position is remembered per route key and restored on back/forward.
- **Trackpad swipe nav:** horizontal two-finger wheel deltas drive history back/forward (commit at `110px`), skipped when the target element scrolls horizontally itself.
- Routing is history-based (`pushState`/`popstate`) with a `state = { view, workflowId, runId, taskId, __idx }` shape, where `__idx` is a monotonic history-depth counter.
- **Sidebar tabs reset the back stack:** clicking a top-level sidebar item calls `navRoot` (not `nav`) — it unwinds history to the base entry (`history.go(-__idx)`) then `replaceState`s the target with `__idx: 0`, so afterwards the back stack holds only that page. In-page links and breadcrumbs still `push` normally.

---

## Screens / Views

> Component files map 1:1 to feature areas (see **Files**). Each `View` is registered on `window.Views` and selected by `state.view` in `app.jsx`.

### 1. Workflows — List (`view: "workflows"`)
- **Purpose:** browse all workflows, jump into one, or create a new one.
- **Layout:** page header (H1 "Workflows" + subtitle, right-aligned **New workflow** primary button), optional toolbar, then a **table card** (`.wf-table`, `--bg-1`, radius `13px`).
- **Table columns** (`grid-template-columns: minmax(240px,1fr) 160px 190px 40px`): Name (name `14px/500` + mono description sub), status/last-run, schedule, and a `40px` action/chevron cell. Header row `38px`, uppercase `11px` dim labels. Rows `min-height: 62px`, hover `--bg-2`, clickable → workflow detail.

### 2. Workflows — Detail (`view: "workflow"`)
- **Purpose:** inspect one workflow: its staged pipeline, schedule, recent runs; entry to edit/run/schedule.
- **Key component — pipeline graph** (`.pipe-wrap`): dotted-grid background (radial-gradient dots on `22px` grid over `--bg-1`), horizontally scrollable `.pipe-track`. Stages laid left→right as `.pipe-col`s separated by `.pipe-conn` connectors (`42px` wide, `2px` line; `.done` = green, `.active` = animated cyan "flow" sweep).
  - **Node** (`.node`, `188px`): icon box + name + mono sub, footer with step count + duration. Hover lifts (`translateY(-1px)` + `--shadow-2`). `.running` node gets a cyan glow ring.
  - **Parallel stages** render inside a dashed `.parallel-wrap` labeled "all at once"; stage tags show "Stage N" with an accent count pill.

### 3. Workflows — Edit (`view: "workflowEdit"`, `workflowId: "__new"` for create)
- **Purpose:** build/modify a workflow — name, description, stages of tasks, per-stage parameter overrides, execution settings, triggers.
- **Layout:** tabbed (`.tabs` — accent underline on active). Stage editor: each stage is a `.stage-edit` block with a mono `st-num` accent pill; **add-task dropdown** (`.add-task-menu` popover) appends tasks. Each task row (`.step-item`) expands into a connected `.task-panel` for **parameters** (rows showing key, required toggle, value, and a **source chip** — `wf` accent = inherited from workflow param, `ov` = overridden) and **execution** settings (timeout, retries via `.stepper`, continue-on-failure toggle).
- **Validation:** invalid inputs get red border + `0 0 0 3px --fail-dim` focus ring; `.field-err` row shows a red message with icon. Title input shows an inset red underline when invalid.
- **Version banner** (`.ver-banner`, amber) warns when editing creates a new version.

### 4. Tasks — Library (`view: "tasks"`)
- **Purpose:** browse the reusable task catalog.
- **Layout:** `.grid-cards` (responsive `minmax(260px,1fr)`). Each `.task-card`: `34px` accent-tinted icon box, name `14px/600`, description, footer tags (`.tag` mono pills — category, interpreter, "used by N"). Hover lifts.

### 5. Tasks — Detail (`view: "task"`)
- **Purpose:** read-only view of a task: metadata, env vars, and its steps with **syntax-highlighted code**.
- **Code editor** (`.code-ed`): header with mono filename + a keyboard-shortcut chip; `.code-area` with a line-number `.gutter` and highlighted code. Token colors: comment dim italic, keyword `oklch(0.78 0.13 300)` (purple), string accent-orange, variable cyan (`--st-run`), function amber (`--st-warn`).

### 6. Tasks — Editor (`view: "taskEdit"`, `taskId: "__new"` for create)
- **Purpose:** create/edit a task — name, icon, category, interpreter, timeout, retries, env vars, and editable steps.
- **Inline code editing:** transparent textarea (`.code-input`, `caret-color` only) layered over a highlight `<pre>` (`.code-hl`) so typing stays syntax-highlighted.
- Saving an existing task bumps its version and snapshots history.

### 7. Triggers / Schedule (`view: "schedule"`)
- **Purpose:** manage how a workflow starts — manual and/or cron.
- **Cron editor** (`.cron-box`): five `.cron-cell` inputs (minute/hour/day/month/weekday), each centered, accent mono `16px`, with an uppercase label underneath. `.sched-card` rows + `.toggle` switches enable/disable each trigger. Saving derives the workflow's `schedule` (`type: cron|manual`, next-run estimate).

### 8. Run — Prepare (`view: "prepare"`)
- **Purpose:** review/fill parameters before launching a run.
- **Layout:** `.prep-row` grid (key | value input). Missing required params highlight the row (`.prep-row.missing`, faint red) and input (`.input.miss`); a top `.prep-warn` red banner blocks launch until filled. Launch builds a `running` execution (random UUID), unshifts it onto run history, and navigates to the Execution page.

### 9. Executions — List (`view: "runs"`)
- **Purpose:** browse run history (200 seeded mock runs, stable across reloads), filter by status, paginate.
- **Layout:** `.toolbar` with a segmented filter (`.seg`: All / Succeeded / Failed). Each run row shows a status **badge** (`noDot`), trigger, workflow, timing, duration. A **succeeded-but-degraded** run shows **two** badges side by side: the green `succeeded` outcome badge plus a separate orange `continued` qualifier badge (outcome and policy are split, never a single orange "succeeded").
- **Pagination footer** (`.pager`): mono info + page buttons (`.pg`, active = accent tint).

### 10. Execution page / Run Detail (`view: "run"`) — **the most complex screen**
- **Purpose:** inspect a single execution end to end.
- **Header:** workflow name + run status badge (running pulses; degraded shows the green `succeeded` badge plus a separate orange `continued` badge beside it, grouped with `gap:6`) + mono run ID; action buttons. Order: **Workspace**, then **Cancel** (while running·queued) / **Re-run** (otherwise), then — on a **failed/cancelled** run with stuck tasks — two **run-level aggregate recovery** buttons placed to the right of Re-run: **Skip failures** (ghost; skips every failed task and finishes the remaining stages, completing the run as `succeeded` + `continued`) and **Retry** (primary; retries every stuck task in place and resumes the run to completion, leaving already-succeeded tasks untouched). After either action the header badge flips to the recovered status and the two buttons disappear. These act on the whole run at once and are distinct from the per-task controls below.
- **Run summary strip** (`.run-summary` → `.meta-grid`, 5 cols): workflow version, start/finish, total duration, stages-clean count, etc.
- **Two-column grid** (`.run-grid`: `232px` rail + content):
  - **Stage rail** (`.run-rail-card`): stages grouped, each with a "Stage N" tag, then per-task rows (`.run-task`). Each row = a status **Dot** + task name + duration (or "Skipped" tag). Selected row highlights. *(A task that **failed but was tolerated** — run succeeded overall via continue-on-failure — carries `continued: true` and shows the **orange `continued` dot** instead of red.)*
  - **Task panel** (`.task-panel`, right column): header (mono task name + version tag + status badge; a "continued" badge appears next to a tolerated failure), **attempt tabs** (`.attempt-tabs` — one tab per retry attempt, mono duration, "final" marker; earlier attempts are failed, last carries the recorded outcome), a **details meta-grid**, a **Parameters / Logs tab strip** (`.tp-tabs`), the **parameters-used** table, and a **terminal** (`.tp-logs` / `.term`) with per-step collapsible log groups (`.step-log` → `.sl-head` + `.term-body`). Log lines (`.log-ln`) are color-coded: `err` red, `warn` amber, `ok` green, `cmd` cyan, `dim` muted; a blinking accent cursor (`.cursor-blink`) marks live output.
- **Recovery controls** come at **two scopes**. **Per-task** (in the task panel, surgical — one task at a time): **Skip** (marks the failed task skipped and unblocks exactly the next stage — you advance stage by stage) and **Retry**. **Run-level** (in the page header, aggregate — the whole run at once, failed/cancelled runs only): **Skip failures** and **Retry** (see Header above). All are gated through the confirm modal / toast.

### 11. Settings (`view: "settings"`)
- **Purpose:** app preferences.
- **Layout:** `.settings-col` (max `760px`) of cards. `.set-row` = label/description on the left, control on the right (`300px`, or right-aligned toggle). Includes **timezone** selection (real IANA zones, persisted to `localStorage` as `ad_timezone`, drives all schedule/timestamp formatting), **data directory** fields (`.ws-field` mono path rows with browse — data directory, plus optional separate-location toggles for execution history and `$WORKSPACE`), a read-only **config-location** callout (`.cfg-note`), **launch-on-startup**, and **keep-running-in-background**.
- **About card** (last card in the column): a `.set-row` **Version** row showing the build label as its description and a ghost **Check for updates** button (simulated async — shows "Checking…" then a "Up to date" check + toast "You're on the latest version"); a row of outbound **link buttons** (pill-style: `30px` tall, `--bg-2`, `--line-soft`, `8px` radius, icon + label, `target="_blank"`) — **View on GitHub** (`https://github.com/hansololz/agent-dave`, GitHub brand icon), **Release notes**, **Report an issue**; and a muted footer block (top border, `11.5px` `--tx-dim`) with copyright + team credit. The link row and footer are separated from the Version row by that row's own `.set-row` bottom border (don't add an extra divider — a duplicate hairline is wrong).

---

## Interactions & Behavior

- **Routing:** history-based; back/forward restore prior view + scroll. Breadcrumbs are derived from `state` (see `app.jsx`).
- **CRUD:** create/edit/delete for workflows and tasks, all going through a central `ctx` action object. Deletes are guarded (a task used by ≥1 workflow can't be deleted; the UI explains via toast). Edits bump a `version`, push a snapshot to history, and stamp `savedAt`.
- **Launching a run:** builds a `running` execution and opens the Execution page.
- **Skip/Retry:** recovery on the Execution page at two scopes — surgical per-task and aggregate run-level (see screen 10).
- **Animations:** card hover lift (`transform .08s` + shadow); active pipeline connector "flow" sweep (`@keyframes flow`, 1.1s linear); running-status `pulse` (1.4s opacity), optional `ring` ping; menu/modal entrances (`ddIn`/`fade`, ~.12–.15s); toast slide-up; terminal `blink` cursor. Keep durations and easings.
- **Status semantics:** map every run/task/step status to the token + badge + dot rules above. Queued = hollow ring dot. **Tolerated failure (continue-on-failure where the run still succeeds) = run `succeeded` + `degraded:true`, task flagged `continued` / orange**, distinct from hard `failed` / red.
- **Validation:** required-field gating with red borders, focus rings, inline error rows, and blocking banners (run prepare).
- **Persistence:** only timezone is persisted (`localStorage["ad_timezone"]`); everything else is in-memory mock state.
- **Responsive:** `.run-grid` collapses to one column < 880px; several meta-grids drop column counts at 720/880/1180px. (This is desktop-first.)

## State Management
Recreate with the target's idiomatic store. The prototype keeps:
- `state` — current route `{ view, workflowId, runId, taskId, editTab? }`.
- `workflows` — list (each with `stages` (array of stage arrays of task IDs), `triggers`, `schedule` (incl. `nextAt`), `params`/`wfParams`/`exec` (per-task `{continueOnFailure, version, enabled}`), `version`, `verHistory`, `lastStatus`, …).
- `tasks` — reusable task library (each with `steps`, `env`, `interpreter`, `timeout`, `retries`, `usedBy`, `version`, `history`).
- `runs` — execution history (each with `id`, `wf`, `trigger`, `actor`, `started`, `dur`, `status` (`queued`/`running`/`succeeded`/`failed`/`cancelled`), `workflow_version`, a `degraded` boolean, and `params`). *(The prototype additionally fabricates per-task outcomes from a `stopAt` index + a `degraded` index-map shim, since it has no backend execution graph.)*
- `timezone`, `toast`, `confirm` (modal descriptor).
- Derived helpers in `data.js`: `runTasksFor(wf, run)` computes per-task status from a run's `stopAt`/`degraded`/`retries`; `stepStatuses(...)` does the same per step; seeded RNG keeps mock data stable.

## Assets
- **Fonts:** IBM Plex Sans + IBM Plex Mono via Google Fonts (`preconnect` + stylesheet). Self-host in production if preferred.
- **Icons:** Font Awesome 6 Free, pulled as **inline SVG** via `FontAwesome.icon()` (auto-replace + mutation observer disabled) so SVGs survive screenshots/PDF/offline. `icons.jsx` maps semantic names → FA glyphs and defines the shared `Icon`, `Badge`, `Dot`, `Btn`, `ConfirmModal` UI primitives on `window.UI`. In the target, replace with the codebase's icon set; the semantic name → glyph map in `icons.jsx` is the reference.
- No raster images; all surfaces are CSS.

## Files
The bundled prototype (open `workflow orchestrator.html` to run it):
- `workflow orchestrator.html` — entry; loads fonts, FA, React/Babel (CDN), and all scripts below.
- `styles.css` — **the complete design system** (tokens, shell, every component). Primary visual reference.
- `data.js` — mock data model + status-derivation helpers (`window.DB`).
- `icons.jsx` — UI primitives (`Icon`, `Badge`, `Dot`, `Btn`, `ConfirmModal`) + FA glyph map (`window.UI`).
- `app.jsx` — app shell: sidebar, topbar/breadcrumbs, router, global `ctx` actions, swipe-nav, scroll memory.
- `views-workflows.jsx` — Workflows list, detail (pipeline graph), edit.
- `views-tasks.jsx` — Tasks library, detail, editor (`window.TaskDetail`, `window.TaskEditor`).
- `views-runs.jsx` — Executions list + **Execution page** (run detail).
- `views-triggers.jsx` — Triggers/Schedule editor.
- `views-settings.jsx` — Settings.
- `tweaks.jsx`, `tweaks-panel.jsx` — preview-only tweak controls (density, etc.); **not part of the product** — ignore for implementation.
- `overlay-scroll.js` — custom overlay scrollbar.
- `orchestrator-data.js` — supplementary status-color/label map.

> Note: the prototype uses `React.createElement` (aliased `e`) instead of JSX and loads everything via global `window.*` namespaces with no build step. In production, use real modules/JSX (or the target framework) — the structure of each view file shows the intended component breakdown.
