// Reusable task-authoring actions for E2E specs. Encodes the journey
// "Tasks → New task → Config/Steps → Create task" once, so CUJ specs read as
// journeys instead of selector soup. See CUJ.md (Create/Python/Steps/Reorder/
// Config groups) and
// src/views/tasks.jsx for the UI these drive.
import { expect } from '../electron.fixture.mjs'

// Navigate to the Tasks library via the sidebar.
export async function gotoTasks(page) {
  await page.getByText('Tasks').first().click()
  await expect(page.getByRole('button', { name: 'New task' })).toBeVisible()
}

// Open the new-task editor (lands on the Config tab, titled "New task").
export async function openNewTask(page) {
  await page.getByRole('button', { name: 'New task' }).click()
  await expect(page.getByPlaceholder('Task name')).toBeVisible()
}

// Set the task name on the Config tab.
export async function setTaskName(page, name) {
  await page.getByPlaceholder('Task name').fill(name)
}

// Replace the first step's code on the Steps tab. The first step is expanded by
// default in a new task, so its editor textarea is already mounted.
export async function setStepCode(page, code) {
  await page.getByRole('button', { name: /^Steps/ }).click()
  const ta = page.locator('textarea.code-input').first()
  await expect(ta).toBeVisible()
  await ta.fill(code)
}

// Add a Python step on the Steps tab. It appends python_script_1.py and
// auto-expands it, so the only mounted code editor is the new step's.
export async function addPythonStep(page) {
  await page.getByRole('button', { name: /^Steps/ }).click()
  await page.getByRole('button', { name: 'Python' }).click()
  await expect(page.getByText('python_script_1.py').first()).toBeVisible()
}

// Replace the open Python step's code. addPythonStep collapses the bash step,
// so the python step is the last (and only) mounted textarea.
export async function setPythonStepCode(page, code) {
  const ta = page.locator('textarea.code-input').last()
  await expect(ta).toBeVisible()
  await ta.fill(code)
}

// Set the task description on the Config tab.
export async function setDescription(page, desc) {
  await page.getByPlaceholder('What does this task do?').fill(desc)
}

// Pick a category by its label from the Config tab's category dropdown. The
// category Select carries no aria-label (the version picker does), so it is
// selected by excluding aria-labelled dropdowns.
export async function setCategory(page, label) {
  await page.locator('.dd-btn:not([aria-label])').click()
  await page.locator('.dd-opt').filter({ hasText: label }).click()
  await expect(page.locator('.dd-btn:not([aria-label]) .dd-val')).toHaveText(label)
}

// Add a step of the given language ('bash' | 'python') on the Steps tab. The new
// step is appended and auto-expanded; its default name is derived in the editor.
export async function addStep(page, lang) {
  await page.getByRole('button', { name: /^Steps/ }).click()
  // exact: a step's lowercase "python"/"bash" language toggle would otherwise
  // also match this capitalized add button.
  await page.getByRole('button', { name: lang === 'python' ? 'Python' : 'Bash', exact: true }).click()
}

// Delete the step with the given filename via its confirm dialog. Only the
// step's own trash button (scoped to its row) and the modal's confirm share the
// "Delete step" label, so each is selected within its container. The last
// remaining step's delete is disabled, so this only works with 2+ steps.
export async function deleteStep(page, name) {
  await page.locator('.code-ed').filter({ hasText: name }).getByRole('button', { name: 'Delete step' }).click()
  await page.locator('.modal-card').getByRole('button', { name: 'Delete step' }).click()
  await expect(page.getByText(name)).toHaveCount(0)
}

// Move the step with the given filename up or down (dir: 'up' | 'down') via its
// row's reorder control. The first step's "up" and the last step's "down" are
// disabled, so only call this for a move the arrangement allows.
export async function moveStep(page, name, dir) {
  const title = dir === 'up' ? 'Move step up' : 'Move step down'
  await page.locator('.code-ed').filter({ hasText: name }).getByRole('button', { name: title }).click()
}

// Assert a step row's reorder controls: the first step's "up" and the last
// step's "down" are disabled, the rest enabled.
export async function expectMoveButtons(page, name, { up, down }) {
  const row = page.locator('.code-ed').filter({ hasText: name })
  const upBtn = row.getByRole('button', { name: 'Move step up' })
  const downBtn = row.getByRole('button', { name: 'Move step down' })
  await (up ? expect(upBtn).toBeEnabled() : expect(upBtn).toBeDisabled())
  await (down ? expect(downBtn).toBeEnabled() : expect(downBtn).toBeDisabled())
}

// The ordered step filenames as shown in the current view (editor or detail),
// read from each step row's header. Use to assert reordering.
export async function stepNames(page) {
  return page.locator('.step-list .code-ed .fn .mono').allTextContents()
}

// Save the new task ("Create task"); returns to the Tasks library on success.
export async function submitNewTask(page) {
  await page.getByRole('button', { name: 'Create task' }).click()
}

// Save edits to an existing task ("Save changes"); returns to the task detail
// (saveTask navigates back to wherever the editor was opened from).
export async function saveChanges(page) {
  await page.getByRole('button', { name: 'Save changes' }).click()
}

// Reopen the editor from the task detail ("Edit"); lands on the Config tab.
export async function reopenEditor(page) {
  await page.getByRole('button', { name: 'Edit' }).click()
}

// --- Parameters (env vars) — the EnvTab below the step list on the Steps tab. ---
// Rows are keyed by index with no per-row test id, so each row is scoped from
// its KEY input (every row has one, placeholder "KEY", regardless of content).

// The grid row for parameter i (0-based): its key input, value input, required
// toggle, and delete button are all reachable from here.
export function paramRow(page, i) {
  return page.locator('input[placeholder="KEY"]').nth(i).locator('xpath=..')
}

// How many parameter rows the editor currently shows.
export function paramCount(page) {
  return page.locator('input[placeholder="KEY"]').count()
}

// Append a parameter row (revealing the Steps tab first) and optionally fill it.
// The new row is appended last; returns its index. Pass {k, v, required} to set
// the key, value, and required flag in one call.
export async function addParam(page, { k = '', v = '', required = false } = {}) {
  await page.getByRole('button', { name: /^Steps/ }).click()
  const before = await paramCount(page)
  await page.getByRole('button', { name: 'Add variable' }).click()
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(before + 1)
  const i = before
  if (k) await setParamKey(page, i, k)
  if (v) await setParamValue(page, i, v)
  if (required) await toggleParamRequired(page, i)
  return i
}

// Set parameter i's key (name).
export async function setParamKey(page, i, k) {
  await paramRow(page, i).locator('input.mono').nth(0).fill(k)
}

// Set parameter i's value (default).
export async function setParamValue(page, i, v) {
  await paramRow(page, i).locator('input.mono').nth(1).fill(v)
}

// Flip parameter i between required and optional.
export async function toggleParamRequired(page, i) {
  await paramRow(page, i).locator('button.req-toggle').click()
}

// Delete parameter i via its row's x button.
export async function deleteParam(page, i) {
  await paramRow(page, i).locator('button.btn-ghost').click()
}
