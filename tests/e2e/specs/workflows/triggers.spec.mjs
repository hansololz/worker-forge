// E2E — group "WF-Triggers" (see CUJ.md), CUJ-WF-TRIGGER-1. Adds a cron trigger
// to a workflow from the editor's Triggers tab: the default schedule, applying a
// quick preset, persistence across save, the per-field cron validation message,
// the enable/disable toggle, and removing the trigger.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, openNewWorkflow, setWorkflowName, addTaskToStageN,
  gotoTriggersTab, addCronTrigger, cronInputs, pickCronPreset,
} from '../../helpers/workflows.mjs'

const cronCard = (page) => page.getByText('Cron schedule', { exact: true })
const dailyDesc = (page) => page.getByText('Runs every day at 03:00 UTC.')

test('CUJ-WF-TRIGGER-1 — add a cron trigger, set a schedule, and persist it', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // A task + a workflow that references it (so the workflow can be saved).
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'trig-task')
  await submitNewTask(page)

  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-trigger')
  await addTaskToStageN(page, 0, 'trig-task')

  // Add a cron trigger — defaults to "0 9 * * *" (hour field = 9).
  await addCronTrigger(page)
  await expect(cronCard(page)).toHaveCount(1)
  await expect(cronInputs(page)).toHaveCount(5)
  await expect(cronInputs(page).nth(1)).toHaveValue('9')

  // Apply the "Daily 03:00" preset — cron becomes "0 3 * * *" with a description.
  await pickCronPreset(page, 'Daily 03:00')
  await expect(dailyDesc(page)).toBeVisible()
  await expect(cronInputs(page).nth(0)).toHaveValue('0')
  await expect(cronInputs(page).nth(1)).toHaveValue('3')

  await page.getByRole('button', { name: 'Create workflow' }).click()

  // Reopen the editor — the trigger and its schedule persisted.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-trigger' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await gotoTriggersTab(page)
  await expect(cronCard(page)).toHaveCount(1)
  await expect(dailyDesc(page)).toBeVisible()
  await expect(cronInputs(page).nth(1)).toHaveValue('3')

  // Per-field validation: an out-of-range minute shows the inline error and marks
  // the field invalid; fixing it clears the error.
  await cronInputs(page).nth(0).fill('99')
  await expect(page.getByText('Invalid value in min')).toBeVisible()
  await expect(cronInputs(page).nth(0)).toHaveAttribute('aria-invalid', 'true')
  await cronInputs(page).nth(0).fill('0')
  await expect(page.getByText('Invalid value in min')).toBeHidden()

  // Disabling the trigger hides its schedule editor; enabling brings it back.
  await page.locator('button.toggle[title="Enabled"]').click()
  await expect(cronInputs(page)).toHaveCount(0)
  await page.locator('button.toggle[title="Disabled"]').click()
  await expect(cronInputs(page)).toHaveCount(5)

  // Removing the trigger drops the card entirely.
  await page.locator('button[title="Remove trigger"]').click()
  await expect(cronCard(page)).toHaveCount(0)
})
