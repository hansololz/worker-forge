// E2E — group "Edit" (see CUJ.md), CUJ-EDIT-1. Edits an existing task across
// both tabs at once — name/description/icon/category/timeout on Config and the
// step code/steps on Steps — saves once, and confirms it all persisted.
import { test, expect } from '../../electron.fixture.mjs'
import {
  gotoTasks, openNewTask, setTaskName, submitNewTask,
  setDescription, setCategory, setStepCode, addStep, setPythonStepCode,
  saveChanges, reopenEditor,
} from '../../helpers/tasks.mjs'

const SELECTED = /var\(--accent-dim\)/

test('CUJ-EDIT-1 — edit a task config and steps; everything persists', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'edit-base')
  await submitNewTask(page)

  // Open the saved task and enter the editor.
  await page.getByText('edit-base').first().click()
  await reopenEditor(page)

  // Edit the config (Config tab): rename, describe, re-icon, re-category, retime.
  await setTaskName(page, 'edit-renamed')
  await setDescription(page, 'Edited description')
  await page.locator('.node-ic').nth(5).click() // a non-default icon
  await setCategory(page, 'Quality')
  await page.locator('input[type="number"]').fill('120')

  // Edit the steps (Steps tab): change the bash step's code and add a python one.
  await setStepCode(page, 'echo edited-step-ok')
  await addStep(page, 'python')
  await setPythonStepCode(page, 'print("py-edited-ok")')

  await saveChanges(page)

  // The saved task detail reflects every config edit...
  await expect(page.getByText('edit-renamed').first()).toBeVisible()
  await expect(page.getByText('Edited description').first()).toBeVisible()
  await expect(page.getByText('Quality').first()).toBeVisible()
  await expect(page.getByText('timeout 2m').first()).toBeVisible()
  // ...and both steps, each carrying its edited code.
  await page.getByText('bash-script.sh').first().click()
  await expect(page.getByText('edited-step-ok').first()).toBeVisible()
  await page.getByText('python_script_1.py').first().click()
  await expect(page.getByText('py-edited-ok').first()).toBeVisible()

  // Reopening the editor shows the persisted config and step code.
  await reopenEditor(page)
  await expect(page.getByPlaceholder('Task name')).toHaveValue('edit-renamed')
  await expect(page.getByPlaceholder('What does this task do?')).toHaveValue('Edited description')
  await expect(page.locator('.node-ic').nth(5)).toHaveAttribute('style', SELECTED)
  await expect(page.locator('.dd-btn:not([aria-label]) .dd-val')).toHaveText('Quality')
  await expect(page.locator('input[type="number"]')).toHaveValue('120')
  await page.getByRole('button', { name: /^Steps/ }).click()
  await expect(page.locator('textarea.code-input').first()).toHaveValue('echo edited-step-ok')
})
