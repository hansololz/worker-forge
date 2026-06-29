// E2E — group "Creating a task" (see CUJ.md), CUJ-TASK-6. Exercises the Config
// tab: description, icon, category, and timeout — selecting every icon and every
// category — then confirms the chosen values persist to the saved task.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, setDescription, setCategory, submitNewTask } from '../../helpers/tasks.mjs'

// All category labels (CAT_LABEL in src/views/tasks.jsx), in selector order.
const CATEGORIES = ['Operations', 'Data', 'Source', 'Build', 'Quality', 'Deploy']
const ICON_COUNT = 18 // icons[] in SettingsTab — every one must be selectable.
const SELECTED = /var\(--accent-dim\)/ // a node-ic's fill once chosen.

test('CUJ-TASK-6 — edit every task config field', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-task-6'
  await setTaskName(page, name)
  await page.getByRole('button', { name: 'Config' }).click()

  // Description.
  const desc = 'Edits every config field'
  await setDescription(page, desc)

  // Every icon option: clicking one selects it (accent fill).
  const icons = page.locator('.node-ic')
  await expect(icons).toHaveCount(ICON_COUNT)
  for (let i = 0; i < ICON_COUNT; i++) {
    await icons.nth(i).click()
    await expect(icons.nth(i)).toHaveAttribute('style', SELECTED)
  }
  // Exactly one icon (the last clicked) remains selected.
  await expect(page.locator('.node-ic[style*="accent-dim"]')).toHaveCount(1)
  await expect(icons.last()).toHaveAttribute('style', SELECTED)

  // Every category option: the dropdown offers all of them and each selects.
  await page.locator('.dd-btn:not([aria-label])').click()
  await expect(page.locator('.dd-opt')).toHaveCount(CATEGORIES.length)
  await page.keyboard.press('Escape')
  for (const label of CATEGORIES) await setCategory(page, label)
  // Leaves the last category (Deploy) selected.

  // Timeout: a numeric value, plus the "No timeout" toggle disabling the field.
  const timeout = page.locator('input[type="number"]')
  const noTimeout = page.locator('label').filter({ hasText: 'No timeout' }).locator('button.toggle')
  await timeout.fill('600')
  await expect(timeout).toHaveValue('600')
  await noTimeout.click()
  await expect(timeout).toBeDisabled()
  await noTimeout.click()
  await expect(timeout).toBeEnabled()
  await timeout.fill('600')

  await submitNewTask(page)

  // The saved config shows in the task detail.
  await page.getByText(name).first().click()
  await expect(page.getByText(desc).first()).toBeVisible()
  await expect(page.getByText('Deploy').first()).toBeVisible()
  await expect(page.getByText('timeout 10m').first()).toBeVisible()

  // Reopen the editor and confirm every field persisted (icon included).
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('.node-ic').last()).toHaveAttribute('style', SELECTED)
  await expect(page.locator('.dd-btn:not([aria-label]) .dd-val')).toHaveText('Deploy')
  await expect(page.getByPlaceholder('What does this task do?')).toHaveValue(desc)
  await expect(page.locator('input[type="number"]')).toHaveValue('600')
})
