# Critical User Journeys (E2E)

Each CUJ is a journey a real user takes through the rendered app, end-to-end
(Electron renderer → main → Python engine → disk). One CUJ ⇒ one `test()` in a
`*.spec.mjs` here, named to match the id. CUJs are grouped; a group is a set of
related journeys over one feature.

Format per CUJ: **id**, goal, preconditions, steps (user actions), expected
(observable result). Steps describe what the *user* does, not DOM selectors —
the spec picks the markup.

---

## Group: Boot

The first thing any user sees: the app launches and the renderer paints the
shell. This runs first; if it fails, every other CUJ is moot. Backed by
`tests/e2e/specs/smoke/boot.spec.mjs`.

### CUJ-BOOT-1 — app boots to the main shell

The first thing any user sees: launch the app and land on the rendered shell.

- **Goal:** confirm the renderer mounts and paints the primary navigation.
- **Preconditions:** app launched (Electron renderer + main + Python engine).
- **Steps:**
  1. Launch the app and wait for it to finish loading.
- **Expected:**
  - The sidebar nav is visible, showing the primary views **Workflows**,
    **Tasks**, and **Settings**.

---

## Group: Backend

Proves the renderer can talk to the Python engine over its injected HTTP URL —
the other half of the liveness check. Backed by
`tests/e2e/specs/smoke/backend.spec.mjs`.

### CUJ-BACKEND-1 — backend is reachable from the renderer

Proves the renderer can talk to the Python engine over its injected HTTP URL.

- **Goal:** confirm the engine is up and the renderer can reach it end-to-end.
- **Preconditions:** app booted (CUJ-BOOT-1 passing).
- **Steps:**
  1. From the renderer, hit the engine's `/api/health` endpoint via the
     preload-injected `window.backend.httpUrl`.
- **Expected:**
  - The endpoint responds with status `ok`.

---

## Group: Create

A task is the reusable unit of work (`§4.2`): a name + ordered bash/python
steps, with optional params/timeout. These journeys cover authoring one from the
Tasks library. Editor flow: **Tasks → New task → Config/Steps tabs → Create
task** (`src/views/tasks.jsx`). Backed by `tests/e2e/specs/tasks/create.spec.mjs`.

### CUJ-CREATE-1 — create a task with a name

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

### CUJ-CREATE-2 — create a task with an edited script

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

---

## Group: Python

A task step can be bash or python. These journeys cover authoring a python step
and confirming its code and generated name persist. Backed by
`tests/e2e/specs/tasks/python.spec.mjs`.

### CUJ-PYTHON-1 — create a task with a python script

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

---

## Group: Steps

Step management in the editor: adding and deleting steps, the invariant that a
task keeps at least one step, and sensible default names. Backed by
`tests/e2e/specs/tasks/steps.spec.mjs`.

### CUJ-STEPS-1 — add and delete steps; the last step is undeletable

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

---

## Group: Reorder

Steps run top-to-bottom, so order matters. These journeys cover moving steps up
and down and confirming the order persists. Backed by
`tests/e2e/specs/tasks/reorder.spec.mjs`.

### CUJ-REORDER-1 — reorder steps and persist the order

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

---

## Group: Config

The Config tab carries a task's metadata: description, icon, category, and
timeout. These journeys cover editing each. Backed by
`tests/e2e/specs/tasks/config.spec.mjs`.

### CUJ-CONFIG-1 — edit every task config field

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

### CUJ-CONFIG-2 — each config value persists across save and re-edit

Deeper than CUJ-CONFIG-1: rather than save once, this saves after *each* value
and re-opens the editor to prove every individual choice round-trips to disk.

- **Goal:** confirm every icon, every category, and several timeout values save
  and survive a re-edit.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create a named task and open its editor.
  2. For each icon: select it, click **Save changes**, then reopen the editor.
  3. For each category: select it, save, check the task detail, then reopen.
  4. For several timeouts (e.g. 45s, 10m, 60m, and **No timeout**): set it, save,
     check the detail, then reopen.
- **Expected:**
  - After re-editing, exactly the saved icon is selected — for every icon.
  - The detail and the reopened editor show the saved category — for every
    category.
  - The detail shows the saved timeout (seconds/minutes, or "no timeout") and the
    reopened editor shows the same value — for every timeout tried.

### CUJ-CONFIG-3 — timeout input rejects <= 0 and accepts large values

The timeout is a min-1 whole-number field. This covers its input validation:
empty is rejected, zero/negatives are not acceptable, and large values save.

- **Goal:** confirm the timeout field enforces a 1-second minimum and accepts
  arbitrarily large whole numbers.
- **Preconditions:** app booted to the Tasks library; a named new task.
- **Steps:**
  1. On the **Config** tab, clear the timeout field.
  2. Enter `0`, then a negative number.
  3. Enter a very large number.
  4. Save a large timeout and reopen the task.
- **Expected:**
  - Clearing the field shows "Enter a whole number of seconds (1 or more)." and
    disables **Create task**.
  - Entering `0` or a negative clamps to the `1`-second minimum (≤ 0 never
    persists) and re-enables saving.
  - `1` second — the minimum — is accepted unchanged, and a saved 1s timeout
    round-trips (detail shows `timeout 1s`).
  - A very large number is accepted unchanged, with no error.
  - A saved large timeout round-trips: the detail shows it (e.g. `100000m`) and
    the reopened editor shows the same seconds value.

---

## Group: Edit

Editing an existing task end-to-end: changing both its Config metadata and its
Steps in one editor session and confirming the whole task round-trips. Backed by
`tests/e2e/specs/tasks/edit.spec.mjs`.

### CUJ-EDIT-1 — edit a task config and steps; everything persists

Where the other groups isolate one field or one step action, this edits across
both tabs at once and verifies nothing is lost on save.

- **Goal:** edit a saved task's config and steps together and confirm every
  change persists.
- **Preconditions:** app booted to the Tasks library; an existing saved task.
- **Steps:**
  1. Open a saved task and click **Edit**.
  2. On **Config**: rename it, set a description, pick a new icon and category,
     and change the timeout.
  3. On **Steps**: edit the existing step's code and add a python step with its
     own code.
  4. Click **Save changes**, view the task detail, then reopen the editor.
- **Expected:**
  - The task detail shows the new name, description, category, and timeout, and
    both steps carrying their edited code.
  - Reopening the editor shows the persisted name, description, icon, category,
    timeout, and step code — every edit survived the single save.

---

## Group: Params

A task can declare **parameters** — environment variables injected into every
step (`§4.2`). Each parameter has a **name** (key), an optional default
**value**, and a **required** flag. The editor for them (`EnvTab`) lives below
the step list on the **Steps** tab; the saved task's detail lists them on a
**Parameters** card. These journeys cover authoring parameters, editing each
field, removing them, and the per-row validation. Backed by
`tests/e2e/specs/tasks/params.spec.mjs`.

### CUJ-PARAMS-1 — add multiple parameters; name, value, required all persist

Author several parameters at once, spanning the field combinations, and confirm
each one's name, value, and required flag round-trips.

- **Goal:** add multiple parameters with distinct name/value/required and
  confirm all of them save and survive a re-edit.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task**, name it, and on the **Steps** tab open the Parameters
     editor.
  2. Add three parameters: one required with a default, one optional with a
     default, and one required with no default.
  3. Click **Create task**, open the saved task, then reopen the editor.
- **Expected:**
  - The task detail's Parameters card shows all three, each with its key, value
     (or "no default"), and required/optional state.
  - Reopening the editor shows every parameter's key, value, and required flag.

### CUJ-PARAMS-2 — edit parameters: rename, revalue, flip required, add, remove

The full editing surface in one session: change a parameter's name, change a
value, flip the required flag both ways, add a parameter, and remove one.

- **Goal:** confirm renaming a key, changing a value, toggling required, adding,
  and removing a parameter all persist together on a single save.
- **Preconditions:** app booted to the Tasks library; a saved task with two
  parameters.
- **Steps:**
  1. Open the saved task, click **Edit**, and open the Parameters editor.
  2. Rename the first parameter, change its value, and make it required.
  3. Change the second parameter's value and make it optional.
  4. Add a third parameter.
  5. Delete the renamed first parameter.
  6. Click **Save changes**, view the detail, then reopen the editor.
- **Expected:**
  - The removed parameter (under both its old and new name) is absent from the
    detail and the editor.
  - The surviving parameters show their new values and required/optional state on
    the detail and persist into the reopened editor.

### CUJ-PARAMS-3 — invalid, duplicate, and blank-key parameters block or drop on save

Per-row parameter validation: a malformed key, a duplicate key, and a blank key
that carries a value each block saving; a fully blank row is valid and dropped.

- **Goal:** confirm parameter validation blocks saving on bad rows and that an
  empty row is silently dropped rather than saved.
- **Preconditions:** app booted to the Tasks library; a named new task.
- **Steps:**
  1. On the **Steps** tab, add a parameter whose key starts with a digit.
  2. Fix the key, then add a second parameter duplicating it.
  3. Clear the duplicate row's key (leaving its value), then clear its value too.
  4. Click **Create task** and open the saved task.
- **Expected:**
  - A key starting with a digit shows the key-format error and disables
    **Create task**; fixing it re-enables saving.
  - A duplicate key shows "Duplicate key" and disables saving.
  - A blank key with a value shows "Key required" and disables saving; clearing
    the value clears the error and re-enables saving.
  - After save, only the one named parameter persists — the empty row is dropped.

---

## Group: Usage

Tasks are reusable and shared across workflows (`§4.2`). The app guards that
sharing: a task referenced by any workflow **cannot be deleted**, and the task
detail's **Used by** card must accurately list the workflows that reference it.
Backed by `tests/e2e/specs/tasks/usage.spec.mjs`.

### CUJ-USAGE-1 — a task cannot be deleted while a workflow uses it

Deleting a task that a workflow still references would orphan that workflow, so
the editor blocks it until the task is no longer referenced.

- **Goal:** confirm the Delete task control is disabled (with an explanatory
  hint) while a workflow uses the task, and becomes enabled — and the task
  deletable — once the reference is removed.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create two tasks; create a workflow whose stage references both.
  2. Open the used task's editor → Config → Delete task section.
  3. Remove that task from the workflow (the other task keeps the stage valid).
  4. Reopen the task editor's Delete task section and delete the task.
- **Expected:**
  - While in use, **Delete task** is disabled with the title "Can't delete —
    still in use" and a hint "In use by 1 workflow…"; the confirm modal can't open.
  - After the reference is removed, the hint reads "isn't used by any workflow",
    **Delete task** is enabled, and confirming the delete removes the task from
    the Tasks library.

### CUJ-USAGE-2 — the task "Used by" list accurately tracks referencing workflows

The task detail's **Used by** card must reflect exactly which workflows
reference the task, updating as references are added and removed.

- **Goal:** confirm the Used by list and count match the set of referencing
  workflows across adds and a removal.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create a shared task (plus a filler task); view its detail.
  2. Create workflow A referencing it, then workflow B referencing it.
  3. Remove the shared task from workflow A.
- **Expected:**
  - Initially the card shows "0 workflows" / "Not used in any workflow yet."
  - After A it lists exactly **A** (1 workflow); after B it lists **A, B**
    (2 workflows).
  - After removing it from A, the card lists exactly **B** (1 workflow).

---

## Group: Task-Validate

A task needs a non-empty name before it can be saved. Backed by
`tests/e2e/specs/tasks/validate.spec.mjs`.

### CUJ-TASK-VALIDATE-1 — a name is required to create a task

- **Goal:** confirm the name-required banner shows and **Create task** is disabled
  until a name is present, re-blocking if the name is cleared.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Click **New task** (the name field starts empty).
  2. Type a name, then clear it again.
- **Expected:**
  - With a blank name, "Task name is required." shows and **Create task** is
    disabled.
  - Entering a name clears the error and enables **Create task**; clearing it
    re-disables saving.

---

## Group: Task-Version

Tasks are versioned: each save mints a new version, and older versions can be
viewed and restored. Backed by `tests/e2e/specs/tasks/version.spec.mjs`.

### CUJ-TASK-VERSION-1 — edits mint versions; an old version can be restored

- **Goal:** confirm a saved edit mints v2, an older version is viewable from the
  detail picker, and restoring it mints a new version.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create a task (v1); open its detail.
  2. Edit it (change the description) and save.
  3. Select **v1** in the version picker, then click **Restore as v3**.
- **Expected:**
  - A fresh task reads **v1**; after the edit the picker reads **v2**.
  - Selecting v1 shows the restore banner with **Restore as v3**.
  - Restoring mints **v3** (the reopened detail shows v3).

---

## Group: Prepare

A task's **required** parameters only bite at run time: before a workflow runs,
the **run-prepare** page reviews every task's parameters and refuses to launch
while any required field is empty (the run-prepare page, `src/views/workflows.jsx`).
This journey crosses three
features — a task with required params, a workflow referencing it, and the
run-prepare review — to confirm the missing-required warning is **visible** and
blocks the run until satisfied. Backed by `tests/e2e/specs/runs/prepare.spec.mjs`.

### CUJ-PREPARE-1 — missing required parameters are flagged before a run

When a referenced task declares required parameters with no value, the
run-prepare page must surface them and block the launch until they are filled.

- **Goal:** confirm the run-prepare page shows a clear missing-required warning
  (banner, per-row alert, disabled launch) and clears it once every required
  parameter has a value.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create a task with two **required** parameters (no defaults) and one
     optional parameter.
  2. Create a workflow whose single stage references that task.
  3. Open the workflow and click **Run** to reach the run-prepare page.
  4. Fill the required parameters one at a time.
- **Expected:**
  - A `.prep-warn` banner is visible reading "2 required parameters still need a
    value" and naming the missing keys; **Run flow** is disabled.
  - Exactly the two required rows are marked missing (the optional one is not),
    each missing input showing the "value required" placeholder, and the task
    card's summary chip counts "2 missing".
  - Filling one required parameter updates the banner to the one still missing
    and keeps the run blocked.
  - Filling the last required parameter removes the banner entirely and enables
    **Run flow** — the optional parameter never blocked the run.

### CUJ-PREPARE-2 — run-page parameter inputs show the correct initial values

Beyond required/missing: each parameter input must open **pre-filled with its
effective default** — the workflow per-task override if set, else the task's
declared default — and show the right placeholder when there is none.

- **Goal:** confirm the run-prepare inputs seed the correct initial value for
  each parameter source (override, task default, none), and that an ad-hoc
  parameter can be added.
- **Preconditions:** app booted to the Tasks library.
- **Steps:**
  1. Create a task with an optional param that has a default, a required param
     with no default, and an optional param with no default.
  2. Create a workflow referencing it and set a workflow-level **override** for
     the param that has a default.
  3. Open the run-prepare page.
  4. Click **Add parameter** to append an ad-hoc row.
- **Expected:**
  - The overridden param's input is pre-filled with the **override** value (not
    the task default) and is not flagged missing.
  - The required no-default param is empty with a "value required" placeholder
    and marked missing; the optional no-default param is empty with a
    "value (optional)" placeholder and not missing.
  - The task card chip counts all params and the one missing.
  - **Add parameter** appends an ad-hoc row (key input + "added" badge + value);
    filling the missing required value enables **Run flow** while the pre-filled
    values are retained.

---

## Group: WF-Create

A workflow is an ordered list of stages, each running one or more task
references in parallel (`§1`, `§4.1`). This group covers authoring one from
scratch in the editor — **Workflows → New workflow → Config/Stages → Create
workflow** (`src/views/workflows.jsx`). Backed by
`tests/e2e/specs/workflows/create.spec.mjs`.

### CUJ-WF-CREATE-1 — create a workflow, modifying every field

Author a workflow that exercises every editable, persisted field: name,
description, multiple stages with tasks, and per-task settings.

- **Goal:** create a workflow setting name, description, two stages each with a
  task, and per-task version pin, continue-on-failure, and a parameter override —
  and confirm all of it round-trips.
- **Preconditions:** app booted to the Tasks library; two saved tasks (one with a
  parameter).
- **Steps:**
  1. Click **New workflow**; on **Config** set the name and description.
  2. On **Stages**, add the first task to stage 1, add a second stage, and add a
     second task to it.
  3. Expand the first task: pin its version, enable continue-on-failure, and set
     a workflow-level override for its parameter. Expand the second task and
     enable continue-on-failure.
  4. Click **Create workflow**, open the saved workflow, then reopen the editor.
- **Expected:**
  - The workflow detail shows the name, description, and "2 stages · 2 tasks".
  - The reopened editor shows the persisted name, description, two stages, the
    pinned version, both continue-on-failure toggles on, and the parameter
    override value.

---

## Group: WF-Edit

Editing a saved workflow: changing its metadata and its stage/task shape in one
editor session and confirming it round-trips and mints a new version. Backed by
`tests/e2e/specs/workflows/edit.spec.mjs`.

### CUJ-WF-EDIT-1 — edit a saved workflow; name, description, and stages persist

Where WF-Create authors a fresh workflow, this edits an existing one across its
metadata and structure at once.

- **Goal:** rename a workflow, change its description, and grow it from one stage
  to two, confirming every edit persists and a new version is minted.
- **Preconditions:** app booted to the Tasks library; a saved single-stage
  workflow.
- **Steps:**
  1. Open a saved workflow and click **Edit**.
  2. On **Config**, rename it and change the description.
  3. On **Stages**, add a second stage and add a second task to it.
  4. Click **Save changes**, view the detail, then reopen the editor.
- **Expected:**
  - The detail shows the new name, description, and "2 stages · 2 tasks", and the
    version picker reads **v2**.
  - The reopened editor shows the persisted name, description, and two stages.

---

## Group: WF-Triggers

A trigger attaches a recurring **cron** schedule to a workflow (`§4.4`). These
journeys cover the workflow editor's Triggers tab: adding a cron trigger,
choosing a schedule, persistence, per-field validation, and enable/remove.
Backed by `tests/e2e/specs/workflows/triggers.spec.mjs`.

### CUJ-WF-TRIGGER-1 — add a cron trigger, set a schedule, and persist it

Add a cron schedule to a workflow and exercise its editor: the default schedule,
a quick preset, save/round-trip, the per-field cron validation message, the
enable/disable toggle, and removal.

- **Goal:** confirm a cron trigger can be added, scheduled via a preset, saved
  and reloaded, validated per field, toggled, and removed.
- **Preconditions:** app booted to the Tasks library; a saved task.
- **Steps:**
  1. Create a workflow referencing the task; open its **Triggers** tab.
  2. Click **Add cron schedule** — a trigger appears defaulting to `0 9 * * *`.
  3. Apply the **Daily 03:00** preset, then click **Create workflow**.
  4. Reopen the editor's Triggers tab.
  5. Enter an out-of-range value in the minute field, then fix it.
  6. Toggle the trigger off and on; then remove it.
- **Expected:**
  - The new trigger defaults to `0 9 * * *`; the preset sets `0 3 * * *` and shows
    "Runs every day at 03:00 UTC."
  - After save and reopen, the trigger and its `0 3 * * *` schedule persist.
  - An out-of-range cron field shows "Invalid value in min…" and marks the field
    invalid; fixing it clears the error.
  - Disabling the trigger hides its schedule editor; enabling restores it;
    removing it drops the card.

---

## Group: WF-Reorder

Stages run sequentially, so their order matters (`§1`). This covers reordering a
workflow's stages and persisting the order. Backed by
`tests/e2e/specs/workflows/reorder.spec.mjs`.

### CUJ-WF-REORDER-1 — reorder stages and persist the new order

- **Goal:** confirm stages can be moved up/down and the resulting order persists
  across save.
- **Preconditions:** app booted to the Tasks library; two saved tasks.
- **Steps:**
  1. Create a workflow with two stages, one task in each.
  2. Move the second stage up, then click **Create workflow**.
  3. Reopen the editor.
- **Expected:**
  - The first stage's "up" and the last stage's "down" controls are disabled.
  - Moving a stage reorders it live; after save and reopen the stages keep the
    reordered sequence.

---

## Group: WF-Validate

Saving a workflow needs a non-empty name and every stage must contain at least
one task. Backed by `tests/e2e/specs/workflows/validate.spec.mjs`.

### CUJ-WF-VALIDATE-1 — a name and a non-empty stage are required to save

- **Goal:** confirm the name-required and empty-stage errors block **Create
  workflow**, and the only stage cannot be deleted.
- **Preconditions:** app booted to the Tasks library; a saved task.
- **Steps:**
  1. Click **New workflow** (nameless, one empty stage).
  2. Enter a name; observe the remaining error.
  3. Add a task to the stage.
- **Expected:**
  - A blank name shows "Workflow name is required." and disables saving.
  - With a name but an empty stage, "Every stage needs at least one task." shows
    and saving stays disabled; the only stage's delete control is disabled.
  - Adding a task clears the error and enables **Create workflow**.

---

## Group: WF-Delete

A workflow can be deleted from its editor's Config tab via the shared confirm
modal. Backed by `tests/e2e/specs/workflows/delete.spec.mjs`.

### CUJ-WF-DELETE-1 — delete a workflow from the editor

- **Goal:** confirm deleting a workflow through the confirm modal removes it from
  the Workflows list.
- **Preconditions:** app booted to the Tasks library; a saved workflow.
- **Steps:**
  1. Open the workflow's editor → Config → **Delete workflow**.
  2. Confirm in the modal.
- **Expected:**
  - The confirm modal appears; confirming deletes the workflow and returns to the
    list, where it no longer appears.

---

## Group: WF-Version

Workflows are versioned: each save mints a new version, and older versions can be
viewed and restored from the detail picker. Backed by
`tests/e2e/specs/workflows/version.spec.mjs`.

### CUJ-WF-VERSION-1 — edits mint versions; an old version can be restored

- **Goal:** confirm a saved edit mints v2, an older version is viewable from the
  detail picker, and restoring it mints a new version.
- **Preconditions:** app booted to the Tasks library; a saved workflow.
- **Steps:**
  1. Create a workflow (v1); open its detail.
  2. Edit it (rename) and save.
  3. Select **v1** in the version picker, then click **Restore as v3**.
- **Expected:**
  - A fresh workflow reads **v1**; after the edit the picker reads **v2**.
  - Selecting v1 shows the restore banner with **Restore as v3**.
  - Restoring mints **v3** (the reopened detail shows v3).
