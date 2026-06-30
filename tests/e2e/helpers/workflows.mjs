// Reusable workflow-authoring + run-prepare actions for E2E specs. Encodes the
// journey "Workflows → New workflow → Config/Stages → Create workflow → Run" so
// CUJ specs read as journeys. See CUJ.md (Prepare group) and src/views/workflows.jsx.
import { expect } from '../electron.fixture.mjs'

// Navigate to the Workflows list via the sidebar.
export async function gotoWorkflows(page) {
  await page.locator('.nav-item', { hasText: 'Workflows' }).click()
  await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible()
}

// Open the new-workflow editor (lands on the Config tab). The fresh draft
// already carries one empty stage.
export async function openNewWorkflow(page) {
  await page.getByRole('button', { name: 'New workflow' }).click()
  await expect(page.getByPlaceholder('Workflow name')).toBeVisible()
}

// Set the workflow name on the Config tab. The Config Name input has a
// placeholder only while creating, so target it by structure (works when editing
// too, where only the page-header title input carries a placeholder).
export async function setWorkflowName(page, name) {
  await page.getByRole('button', { name: /^Config/ }).click()
  await page.locator('.field input.input.mono').first().fill(name)
}

// On the Stages tab, add an existing task (by name) to the first stage via the
// stage's "Add task" menu.
export async function addTaskToStage(page, taskName) {
  await page.getByRole('button', { name: /^Stages/ }).click()
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.locator('.add-task-item', { hasText: taskName }).click()
}

// Save the new workflow ("Create workflow"); returns to the Workflows list.
export async function submitNewWorkflow(page) {
  await page.getByRole('button', { name: 'Create workflow' }).click()
}

// Author a workflow whose single stage references one existing task, end to end.
export async function createWorkflowWithTask(page, { name, taskName }) {
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, name)
  await addTaskToStage(page, taskName)
  await submitNewWorkflow(page)
}

// From the Workflows list, open a workflow's detail and click "Run" to reach the
// run-prepare page.
export async function openRunPrepare(page, name) {
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: name }).click()
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(page.getByText('Review the parameters for this run')).toBeVisible()
}

// Set the workflow description on the Config tab.
export async function setWorkflowDesc(page, desc) {
  await page.getByRole('button', { name: /^Config/ }).click()
  await page.locator('textarea.textarea').fill(desc)
}

// Switch to the Stages / Triggers tab.
export async function gotoStagesTab(page) {
  await page.getByRole('button', { name: /^Stages/ }).click()
}
export async function gotoTriggersTab(page) {
  await page.getByRole('button', { name: /^Triggers/ }).click()
}

// Append a stage (Stages tab).
export async function addStage(page) {
  await gotoStagesTab(page)
  await page.getByRole('button', { name: 'Add stage' }).click()
}

// The editor card for stage i (0-based).
export function stageCard(page, i) {
  return page.locator('.stage-edit').nth(i)
}

// Add an existing task (by name) to stage i via that stage's "Add task" menu.
export async function addTaskToStageN(page, i, taskName) {
  await gotoStagesTab(page)
  const card = stageCard(page, i)
  await card.getByRole('button', { name: 'Add task' }).click()
  await card.locator('.add-task-item', { hasText: taskName }).click()
}

// Remove a task (by name) from stage i via its row's "Remove from stage" button.
export async function removeTaskFromStageN(page, i, taskName) {
  await gotoStagesTab(page)
  await stageCard(page, i).locator('.task-block', { hasText: taskName }).getByRole('button', { name: 'Remove from stage' }).click()
}

// Move stage i up or down (dir: 'up' | 'down').
export async function moveStage(page, i, dir) {
  await stageCard(page, i).getByRole('button', { name: dir === 'up' ? 'Move stage up' : 'Move stage down' }).click()
}

// Expand a task's config panel (click its row) within stage i. The per-task
// setters below are scoped to stage i, so several panels may be open at once.
export async function openTaskPanel(page, i, taskName) {
  await stageCard(page, i).locator('.step-item', { hasText: taskName }).click()
}

// The open task panel within stage i (one task per stage in these specs).
export function taskPanel(page, i) {
  return stageCard(page, i).locator('.task-block.open')
}

// Pick a task-version option (label, e.g. 'Latest' or 'v1') for stage i's task.
export async function setTaskVersion(page, i, label) {
  await taskPanel(page, i).locator('button.select[aria-label="Task version"]').click()
  await page.locator('.dd-opt', { hasText: label }).click()
}

// Toggle stage i's task "Continue on failure" switch.
export async function toggleContinueOnFail(page, i) {
  await taskPanel(page, i).locator('.exec-row', { hasText: 'Continue on failure' }).locator('button.toggle').click()
}

// Set a workflow-level per-task override for one of stage i's task params.
export async function setParamOverride(page, i, key, value) {
  await taskPanel(page, i).locator('.param-row', { hasText: key }).locator('input.param-v').fill(value)
}

// --- Triggers (the workflow editor's Triggers tab). ---

// Add a cron trigger (defaults to 0 9 * * *).
export async function addCronTrigger(page) {
  await gotoTriggersTab(page)
  await page.getByRole('button', { name: 'Add cron schedule' }).click()
}

// The five raw cron-field inputs (min, hour, day, month, weekday), in order.
export function cronInputs(page) {
  return page.locator('.cron-box input.mono')
}

// Apply a quick-preset chip (e.g. 'Daily 03:00') to the trigger.
export async function pickCronPreset(page, label) {
  await page.locator('button.chip', { hasText: label }).click()
}
