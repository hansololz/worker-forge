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

// Set the workflow name on the Config tab.
export async function setWorkflowName(page, name) {
  await page.getByPlaceholder('Workflow name').fill(name)
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
