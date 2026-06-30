// E2E — group "WF-Preview" (see CUJ.md), CUJ-WF-PREVIEW-1. The workflow detail
// shows a pipeline preview: one chip per task, in stage order. This confirms the
// preview matches the workflow's stages/tasks, that each chip links to the real
// task, and that the preview stays accurate after the workflow is edited.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, openNewWorkflow, setWorkflowName,
  gotoStagesTab, addStage, addTaskToStageN, removeTaskFromStageN, moveStage,
} from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

// Task-name chips in the detail pipeline preview, in order.
const previewChips = (page) => page.locator('.pipe-wrap .chip')

async function openWorkflow(page, name) {
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: name }).click()
}

test('CUJ-WF-PREVIEW-1 — the workflow pipeline preview matches its tasks and stays accurate', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await makeTask(page, 'prev-a')
  await makeTask(page, 'prev-b')
  await makeTask(page, 'prev-c')

  // Workflow: stage 1 = [prev-a, prev-b], stage 2 = [prev-c].
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-preview')
  await gotoStagesTab(page)
  await addTaskToStageN(page, 0, 'prev-a')
  await addTaskToStageN(page, 0, 'prev-b')
  await addStage(page)
  await addTaskToStageN(page, 1, 'prev-c')
  await page.getByRole('button', { name: 'Create workflow' }).click()

  // Detail preview: the count and every chip match the workflow, in stage order.
  await openWorkflow(page, 'wf-preview')
  await expect(page.getByText('2 stages · 3 tasks').first()).toBeVisible()
  await expect(previewChips(page)).toHaveText(['prev-a', 'prev-b', 'prev-c'])

  // Edit the shape: drop prev-b from stage 1 and move stage 2 ahead of stage 1.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await gotoStagesTab(page)
  await removeTaskFromStageN(page, 0, 'prev-b')
  await moveStage(page, 1, 'up')
  await page.getByRole('button', { name: 'Save changes' }).click()

  // The preview stays accurate: new count, prev-b gone, new stage order.
  await expect(page.getByText('2 stages · 2 tasks').first()).toBeVisible()
  await expect(previewChips(page)).toHaveText(['prev-c', 'prev-a'])

  // A preview chip links to the real task it names.
  await previewChips(page).filter({ hasText: 'prev-c' }).click()
  await expect(page.getByRole('heading', { name: 'Used by' })).toBeVisible()
  await expect(page.getByText('prev-c', { exact: true }).first()).toBeVisible()
})
