// E2E — group "WF-Create" (see CUJ.md), CUJ-WF-CREATE-1. Authors a workflow from
// scratch, modifying every editable field that persists: name, description,
// multiple stages each with a task, and per-task settings (version pin,
// continue-on-failure, a workflow-level parameter override). Confirms it all
// round-trips to the saved workflow.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addParam, submitNewTask, reopenEditor } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, openNewWorkflow, setWorkflowName, setWorkflowDesc,
  gotoStagesTab, addStage, stageCard, addTaskToStageN, openTaskPanel,
  taskPanel, setTaskVersion, toggleContinueOnFail, setParamOverride,
} from '../../helpers/workflows.mjs'

// Create a task with the given name; optionally seed one parameter.
async function makeTask(page, name, param) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  if (param) await addParam(page, param)
  await submitNewTask(page)
}

test('CUJ-WF-CREATE-1 — create a workflow, modifying every field', async ({ page }) => {
  test.slow() // task setup + multi-stage authoring + a full re-edit round-trip
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // Two tasks to reference; task-a declares a param so its override is testable.
  await makeTask(page, 'wf-task-a', { k: 'GREETING', v: 'hi', required: false })
  await makeTask(page, 'wf-task-b')

  // New workflow — Config fields.
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-create-all')
  await setWorkflowDesc(page, 'Full create coverage')

  // Two stages, each with one task.
  await gotoStagesTab(page)
  await addTaskToStageN(page, 0, 'wf-task-a')
  await addStage(page)
  await addTaskToStageN(page, 1, 'wf-task-b')
  await expect(page.locator('.stage-edit')).toHaveCount(2)

  // Stage 0 / task-a settings: pin to v1, continue-on-failure on, override param.
  await openTaskPanel(page, 0, 'wf-task-a')
  await setTaskVersion(page, 0, 'v1')
  await toggleContinueOnFail(page, 0)
  await setParamOverride(page, 0, 'GREETING', 'override-val')

  // Stage 1 / task-b: continue-on-failure on.
  await openTaskPanel(page, 1, 'wf-task-b')
  await toggleContinueOnFail(page, 1)

  await page.getByRole('button', { name: 'Create workflow' }).click()

  // Open the saved workflow's detail; it reflects name, description, and shape.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-create-all' }).click()
  await expect(page.getByText('Full create coverage').first()).toBeVisible()
  await expect(page.getByText('2 stages · 2 tasks').first()).toBeVisible()

  // Reopen the editor and confirm every field persisted.
  await reopenEditor(page)
  await expect(page.locator('.field input.input.mono').first()).toHaveValue('wf-create-all')
  await expect(page.locator('textarea.textarea')).toHaveValue('Full create coverage')

  await gotoStagesTab(page)
  await expect(page.locator('.stage-edit')).toHaveCount(2)

  await openTaskPanel(page, 0, 'wf-task-a')
  await expect(taskPanel(page, 0).locator('button.select[aria-label="Task version"] .dd-val')).toContainText('v1')
  await expect(taskPanel(page, 0).locator('.exec-row', { hasText: 'Continue on failure' }).locator('button.toggle')).toHaveAttribute('aria-checked', 'true')
  await expect(taskPanel(page, 0).locator('.param-row', { hasText: 'GREETING' }).locator('input.param-v')).toHaveValue('override-val')

  await openTaskPanel(page, 1, 'wf-task-b')
  await expect(taskPanel(page, 1).locator('.exec-row', { hasText: 'Continue on failure' }).locator('button.toggle')).toHaveAttribute('aria-checked', 'true')
})
