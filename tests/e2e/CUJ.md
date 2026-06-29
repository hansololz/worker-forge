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

### CUJ-TASK-3 — create a task with a python script

Author a task with a Python step, customize its code, and confirm the saved
result carries both the step's name and the edited code.

- **Goal:** author a task whose Python step persists with an edited body.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task** — the editor opens on the **Config** tab.
  2. Type a unique name into the **Name** field.
  3. Switch to the **Steps** tab and click **Python** — a new
     `python_script_1.py` step is appended and expanded.
  4. Replace the python step's code in the editor (e.g. a `print` of a unique
     marker).
  5. Click **Create task**.
- **Expected:**
  - The task is saved and listed in the Tasks library under its name.
  - Opening it (task detail) shows the step named `python_script_1.py` carrying
    the edited code, not the default template body.

### CUJ-TASK-4 — add and delete steps; the last step is undeletable

Author-time step management: a task must always keep at least one step, added
steps get sensible default names, and deleting works down to that last step.

- **Goal:** confirm steps can be added and deleted, default step names are
  sensible, and the final step cannot be deleted.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task**, name it, and switch to the **Steps** tab.
  2. Observe the single default step `bash-script.sh`; its delete control is
     disabled (titled "A task needs at least one step").
  3. Click **Python** twice — the new steps default to `python_script_1.py`
     and `python_script_2.py` (clean stems, incrementing numbers).
  4. With several steps present, delete the two python steps.
- **Expected:**
  - A new task's default step is `bash-script.sh`; added steps get sensible,
    non-colliding default names (`python_script_1.py`, `python_script_2.py`).
  - While more than one step exists, every step's delete is enabled.
  - Once a single step remains, its delete is disabled again — the task always
    keeps at least one step.
  - The task saves with its single default step.

### CUJ-TASK-5 — reorder steps and persist the order

Steps run top-to-bottom, so their order matters. This covers reordering a
task's steps with the up/down controls and confirming the new order is saved.

- **Goal:** confirm steps can be moved up and down and the resulting order
  persists across save, for several arrangements.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task**, name it, and on the **Steps** tab add two python
     steps so the task has three: `bash-script.sh`, `python_script_1.py`,
     `python_script_2.py`.
  2. Use a step's **Move step up** / **Move step down** controls to rearrange
     the steps into a target order.
  3. Click **Create task**, then open the saved task.
  4. Repeat for several different target arrangements.
- **Expected:**
  - The first step's "up" and the last step's "down" controls are disabled.
  - Each move reorders the steps live in the editor.
  - After save, the task detail lists the steps in the reordered sequence — for
    every arrangement tried.

### CUJ-TASK-6 — edit every task config field

The Config tab carries a task's metadata: description, icon, category, and
timeout. This covers editing each and confirming the choices persist.

- **Goal:** edit every Config field — exercising all icon and category options —
  and confirm the values save.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task**, name it, and stay on the **Config** tab.
  2. Type a description.
  3. Click through every icon in the picker; each becomes the selected icon.
  4. Open the category dropdown and select each category in turn.
  5. Enter a timeout, then toggle **No timeout** off and on to confirm it
     enables/disables the field; leave a numeric timeout.
  6. Click **Create task**, open the saved task, then reopen the editor.
- **Expected:**
  - Selecting an icon marks exactly that one selected; every icon is selectable.
  - The category dropdown offers every category and each can be chosen.
  - **No timeout** disables the timeout field; turning it off re-enables it.
  - The task detail shows the saved description, category, and timeout; reopening
    the editor shows the persisted description, icon, category, and timeout.
