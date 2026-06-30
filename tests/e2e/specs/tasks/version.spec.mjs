// E2E — group "Task-Version" (see CUJ.md), CUJ-TASK-VERSION-1. Each save mints a
// new task version; an older version can be viewed from the detail picker and
// restored as a fresh version.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask, setDescription, reopenEditor, saveChanges } from '../../helpers/tasks.mjs'

const taskPicker = (page) => page.locator('button.select[aria-label="Task version"] .dd-val')

async function openTask(page, name) {
  await gotoTasks(page)
  await page.getByText(name, { exact: true }).first().click()
}

test('CUJ-TASK-VERSION-1 — edits mint versions; an old version can be restored', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'tver')
  await submitNewTask(page)

  // Fresh task is v1.
  await openTask(page, 'tver')
  await expect(taskPicker(page)).toContainText('v1')

  // Editing and saving mints v2.
  await reopenEditor(page)
  await page.getByRole('button', { name: 'Config' }).click()
  await setDescription(page, 'second version')
  await saveChanges(page)
  await expect(taskPicker(page)).toContainText('v2')

  // Select the older v1 — the restore banner appears.
  await page.locator('button.select[aria-label="Task version"]').click()
  await page.locator('.dd-opt', { hasText: 'v1' }).click()
  await expect(page.locator('.ver-banner')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Restore as v3' })).toBeVisible()

  // Restoring mints v3 (save returns to the list; reopen to confirm).
  await page.getByRole('button', { name: 'Restore as v3' }).click()
  await openTask(page, 'tver')
  await expect(taskPicker(page)).toContainText('v3')
})
