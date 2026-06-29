# Critical User Journeys (E2E)

Each CUJ is a journey a real user takes through the rendered app, end-to-end
(Electron renderer → main → Python engine → disk). One CUJ ⇒ one `test()` in a
`*.spec.mjs` here, named to match the id. CUJs are grouped; a group is a set of
related journeys over one feature.

Format per CUJ: **id**, goal, preconditions, steps (user actions), expected
(observable result). Steps describe what the *user* does, not DOM selectors —
the spec picks the markup.

---

## Group: Smoke

The bare-minimum journeys proving the app is alive: the shell paints and the
Python engine answers. These run first; if either fails, every other CUJ is
moot. Backed by `tests/e2e/specs/smoke.spec.mjs`.

### CUJ-SMOKE-1 — app boots to the main shell

The first thing any user sees: launch the app and land on the rendered shell.

- **Goal:** confirm the renderer mounts and paints the primary navigation.
- **Preconditions:** app launched (Electron renderer + main + Python engine).
- **Steps:**
  1. Launch the app and wait for it to finish loading.
- **Expected:**
  - The sidebar nav is visible, showing the primary views **Workflows**,
    **Tasks**, and **Settings**.

### CUJ-SMOKE-2 — backend is reachable from the renderer

Proves the renderer can talk to the Python engine over its injected HTTP URL.

- **Goal:** confirm the engine is up and the renderer can reach it end-to-end.
- **Preconditions:** app booted (CUJ-SMOKE-1 passing).
- **Steps:**
  1. From the renderer, hit the engine's `/api/health` endpoint via the
     preload-injected `window.backend.httpUrl`.
- **Expected:**
  - The endpoint responds with status `ok`.

---

## Group: Creating a task

A task is the reusable unit of work (`§4.2`): a name + ordered bash/python
steps, with optional params/timeout. These journeys cover authoring one from the
Tasks library. Editor flow: **Tasks → New task → Config/Steps tabs → Create
task** (`src/views/tasks.jsx`).

### CUJ-TASK-1 — create a task with a name

The minimal happy path: a named task saved with all defaults.

- **Goal:** author a new task that persists, supplying only a name.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task** — the task editor opens on the **Config** tab, titled
     "New task".
  2. Type a unique name (e.g. `my-task`) into the **Name** field.
  3. Click **Create task**.
- **Expected:**
  - The name-required error is absent and **Create task** is enabled once a name
    is present (it is disabled while the name is blank).
  - After save, the task appears in the Tasks library under its category
    (default **Operations**) with its name.
  - It carries the defaults: one `bash-script.sh` step, no params, 300s timeout.

### CUJ-TASK-2 — create a task with an edited script

Same authoring path, but the user customizes the step's code before saving.

- **Goal:** author a task whose step code differs from the default template.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task** — the editor opens on the **Config** tab.
  2. Type a unique name into the **Name** field.
  3. Switch to the **Steps** tab; the default `bash-script.sh` step is present.
  4. Open the step and replace its code in the editor (e.g. `echo edited-ok`).
  5. Click **Create task**.
- **Expected:**
  - The task is saved and listed in the Tasks library.
  - Opening it (task detail) shows the step carrying the edited code, not the
    default template body.
