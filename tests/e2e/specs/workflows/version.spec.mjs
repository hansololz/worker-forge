// E2E — group "WF-Version" (see CUJ.md), CUJ-WF-VERSION-1. Each save mints a new
// workflow version; an older version can be viewed from the detail picker and
// restored as a fresh version.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask } from '../../helpers/tasks.mjs'
import { gotoWorkflows, createWorkflowWithTask, setWorkflowName } from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

const wfPicker = (page) => page.locator('button.select[aria-label="Workflow version"] .dd-val')

async function openWorkflow(page, name) {
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: name }).click()
}

test('CUJ-WF-VERSION-1 — edits mint versions; an old version can be restored', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await makeTask(page, 'wver-task')
  await createWorkflowWithTask(page, { name: 'wf-ver', taskName: 'wver-task' })

  // Fresh workflow is v1.
  await openWorkflow(page, 'wf-ver')
  await expect(wfPicker(page)).toContainText('v1')

  // Editing and saving mints v2.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await setWorkflowName(page, 'wf-ver-renamed')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(wfPicker(page)).toContainText('v2')

  // Select the older v1 from the picker — the restore banner appears.
  await page.locator('button.select[aria-label="Workflow version"]').click()
  await page.locator('.dd-opt', { hasText: 'v1' }).click()
  await expect(page.locator('.ver-banner')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore as v3' })).toBeVisible()

  // Restoring it mints v3 (save returns to the list; reopen to confirm).
  await page.getByRole('button', { name: 'Restore as v3' }).click()
  await openWorkflow(page, 'wf-ver')
  await expect(wfPicker(page)).toContainText('v3')
})
