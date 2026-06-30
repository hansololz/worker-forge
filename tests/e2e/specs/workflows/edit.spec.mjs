// E2E — group "WF-Edit" (see CUJ.md), CUJ-WF-EDIT-1. Edits a saved workflow:
// renames it, changes the description, and grows it from one stage to two by
// adding a stage with a second task. Confirms the edits persist and mint a new
// version.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, createWorkflowWithTask,
  setWorkflowName, setWorkflowDesc, gotoStagesTab, addStage, addTaskToStageN,
} from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

test('CUJ-WF-EDIT-1 — edit a saved workflow; name, description, and stages persist', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await makeTask(page, 'edit-task-a')
  await makeTask(page, 'edit-task-b')

  // Baseline: a single-stage workflow referencing edit-task-a (saved as v1).
  await createWorkflowWithTask(page, { name: 'wf-edit-base', taskName: 'edit-task-a' })

  // Open it and edit.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-edit-base' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()

  // Rename, re-describe, and add a second stage with a second task.
  await setWorkflowName(page, 'wf-edit-renamed')
  await setWorkflowDesc(page, 'Edited workflow description')
  await addStage(page)
  await addTaskToStageN(page, 1, 'edit-task-b')
  await expect(page.locator('.stage-edit')).toHaveCount(2)

  await page.getByRole('button', { name: 'Save changes' }).click()

  // Back on the detail: every edit shows, and a new version (v2) was minted.
  await expect(page.getByText('wf-edit-renamed').first()).toBeVisible()
  await expect(page.getByText('Edited workflow description').first()).toBeVisible()
  await expect(page.getByText('2 stages · 2 tasks').first()).toBeVisible()
  await expect(page.locator('button.select[aria-label="Workflow version"] .dd-val')).toContainText('v2')

  // Reopening the editor shows the persisted name, description, and two stages.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.locator('.field input.input.mono').first()).toHaveValue('wf-edit-renamed')
  await expect(page.locator('textarea.textarea')).toHaveValue('Edited workflow description')
  await gotoStagesTab(page)
  await expect(page.locator('.stage-edit')).toHaveCount(2)
})
