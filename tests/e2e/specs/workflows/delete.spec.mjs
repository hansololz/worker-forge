// E2E — group "WF-Delete" (see CUJ.md), CUJ-WF-DELETE-1. A workflow can be
// deleted from its editor's Config tab via the shared confirm modal; afterward
// it's gone from the Workflows list.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import { gotoWorkflows, createWorkflowWithTask } from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

test('CUJ-WF-DELETE-1 — delete a workflow from the editor', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await makeTask(page, 'wdel-task')
  await createWorkflowWithTask(page, { name: 'wf-to-delete', taskName: 'wdel-task' })

  // Open the workflow's editor and click Delete workflow on the Config tab.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-to-delete' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Config' }).click()
  await page.getByRole('button', { name: 'Delete workflow' }).click()

  // The shared confirm modal appears; confirming deletes and returns to the list.
  await expect(page.locator('.modal-card')).toBeVisible()
  await page.locator('.modal-card').getByRole('button', { name: 'Delete workflow' }).click()

  // It's gone from the Workflows list.
  await gotoWorkflows(page)
  await expect(page.locator('.wf-row', { hasText: 'wf-to-delete' })).toHaveCount(0)
})
