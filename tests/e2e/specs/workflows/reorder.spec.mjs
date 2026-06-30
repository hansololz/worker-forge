// E2E — group "WF-Reorder" (see CUJ.md), CUJ-WF-REORDER-1. Stages run
// sequentially, so their order matters. This adds two stages, reorders them with
// the move controls, and confirms the new order persists across save.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, openNewWorkflow, setWorkflowName,
  gotoStagesTab, addStage, addTaskToStageN, stageCard, moveStage,
} from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

test('CUJ-WF-REORDER-1 — reorder stages and persist the new order', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await makeTask(page, 'rstage-a')
  await makeTask(page, 'rstage-b')

  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-reorder')
  await gotoStagesTab(page)
  await addTaskToStageN(page, 0, 'rstage-a')
  await addStage(page)
  await addTaskToStageN(page, 1, 'rstage-b')
  await expect(page.locator('.stage-edit')).toHaveCount(2)

  // Ends are pinned: stage 1 can't move up, stage 2 can't move down.
  await expect(stageCard(page, 0).getByRole('button', { name: 'Move stage up' })).toBeDisabled()
  await expect(stageCard(page, 1).getByRole('button', { name: 'Move stage down' })).toBeDisabled()

  // Move the second stage (rstage-b) up — the order becomes b, a.
  await moveStage(page, 1, 'up')
  await expect(stageCard(page, 0)).toContainText('rstage-b')
  await expect(stageCard(page, 1)).toContainText('rstage-a')

  await page.getByRole('button', { name: 'Create workflow' }).click()

  // Reopen the editor — the reordered sequence persisted.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-reorder' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await gotoStagesTab(page)
  await expect(stageCard(page, 0)).toContainText('rstage-b')
  await expect(stageCard(page, 1)).toContainText('rstage-a')
})
