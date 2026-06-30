// E2E — group "WF-Validate" (see CUJ.md), CUJ-WF-VALIDATE-1. Saving a workflow
// is gated: it needs a non-empty name and every stage must hold at least one
// task. This exercises both error banners and the only-stage delete guard.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, openNewWorkflow, setWorkflowName,
  gotoStagesTab, addTaskToStageN, stageCard,
} from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

test('CUJ-WF-VALIDATE-1 — a name and a non-empty stage are required to save', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await makeTask(page, 'val-task')

  await gotoWorkflows(page)
  await openNewWorkflow(page)
  const create = page.getByRole('button', { name: 'Create workflow' })

  // A new workflow starts nameless with one empty stage — the name error shows
  // and saving is blocked.
  await expect(page.getByText('Workflow name is required.')).toBeVisible()
  await expect(create).toBeDisabled()

  // Naming it clears that error, but the empty stage still blocks saving.
  await setWorkflowName(page, 'wf-valid')
  await expect(page.getByText('Workflow name is required.')).toBeHidden()
  await expect(page.getByText('Every stage needs at least one task.')).toBeVisible()
  await expect(create).toBeDisabled()

  // The single stage can't be deleted (a workflow needs at least one stage).
  await gotoStagesTab(page)
  await expect(stageCard(page, 0).locator('button[title="A workflow needs at least one stage"]')).toBeDisabled()

  // Adding a task to the stage clears the last error and enables saving.
  await addTaskToStageN(page, 0, 'val-task')
  await expect(page.getByText('Every stage needs at least one task.')).toBeHidden()
  await expect(create).toBeEnabled()
})
