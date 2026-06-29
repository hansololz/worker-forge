// E2E — group "Config" (see CUJ.md), CUJ-CONFIG-1. Exercises the Config
// tab: description, icon, category, and timeout — selecting every icon and every
// category — then confirms the chosen values persist to the saved task.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, setDescription, setCategory, submitNewTask, saveChanges, reopenEditor } from '../../helpers/tasks.mjs'

// All category labels (CAT_LABEL in src/views/tasks.jsx), in selector order.
const CATEGORIES = ['Operations', 'Data', 'Source', 'Build', 'Quality', 'Deploy']
const ICON_COUNT = 18 // icons[] in SettingsTab — every one must be selectable.
const SELECTED = /var\(--accent-dim\)/ // a node-ic's fill once chosen.

test('CUJ-CONFIG-1 — edit every task config field', async ({ page }) => {
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

// Timeout values to round-trip and the string the detail shows for each
// (fmtTimeout in src/views/tasks.jsx: >=60s → minutes, else seconds).
const TIMEOUTS = [
  { secs: '45', shown: 'timeout 45s' },
  { secs: '600', shown: 'timeout 10m' },
  { secs: '3600', shown: 'timeout 60m' },
]

test('CUJ-CONFIG-2 — each config value persists across save and re-edit', async ({ page }) => {
  test.slow() // many save → verify → re-edit round-trips
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-config-2'
  await setTaskName(page, name)
  await submitNewTask(page)

  // Open the saved task and enter the editor (lands on Config).
  await page.getByText(name).first().click()
  await reopenEditor(page)

  // Each icon: select it, save, re-edit, and confirm exactly it persisted.
  const icons = page.locator('.node-ic')
  for (let i = 0; i < ICON_COUNT; i++) {
    await icons.nth(i).click()
    await saveChanges(page)
    await reopenEditor(page)
    await expect(icons.nth(i)).toHaveAttribute('style', SELECTED)
    await expect(page.locator('.node-ic[style*="accent-dim"]')).toHaveCount(1)
  }

  // Each category: select, save, verify on detail, re-edit, confirm.
  for (const label of CATEGORIES) {
    await setCategory(page, label)
    await saveChanges(page)
    await expect(page.getByText(label).first()).toBeVisible()
    await reopenEditor(page)
    await expect(page.locator('.dd-btn:not([aria-label]) .dd-val')).toHaveText(label)
  }

  // Several timeout values: save, verify on detail, re-edit, confirm.
  const timeout = page.locator('input[type="number"]')
  for (const { secs, shown } of TIMEOUTS) {
    await timeout.fill(secs)
    await saveChanges(page)
    await expect(page.getByText(shown).first()).toBeVisible()
    await reopenEditor(page)
    await expect(timeout).toHaveValue(secs)
  }

  // And "no timeout": the toggle disables the field; the detail says so.
  await page.locator('label').filter({ hasText: 'No timeout' }).locator('button.toggle').click()
  await expect(timeout).toBeDisabled()
  await saveChanges(page)
  await expect(page.getByText('no timeout').first()).toBeVisible()
  await reopenEditor(page)
  await expect(timeout).toBeDisabled()
})

test('CUJ-CONFIG-3 — timeout input rejects <= 0 and accepts large values', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-config-3'
  await setTaskName(page, name)
  await page.getByRole('button', { name: 'Config' }).click()

  const timeout = page.locator('input[type="number"]')
  const create = page.getByRole('button', { name: 'Create task' })
  const timeoutErr = page.getByText('Enter a whole number of seconds (1 or more).')

  // The field is a stepped, min-1 number input; the default (300s) is valid.
  await expect(timeout).toHaveAttribute('min', '1')
  await expect(timeout).toHaveValue('300')
  await expect(create).toBeEnabled()

  // Empty is invalid: the error shows and saving is blocked.
  await timeout.fill('')
  await expect(timeoutErr).toBeVisible()
  await expect(create).toBeDisabled()

  // Zero and negatives are not acceptable — the field clamps to the 1s minimum.
  await timeout.fill('0')
  await expect(timeout).toHaveValue('1')
  await expect(timeoutErr).toBeHidden()
  await expect(create).toBeEnabled()
  await timeout.fill('-5')
  await expect(timeout).toHaveValue('1')
  await expect(create).toBeEnabled()

  // 1 second — the minimum — is accepted unchanged, not clamped or flagged.
  await timeout.fill('1')
  await expect(timeout).toHaveValue('1')
  await expect(timeoutErr).toBeHidden()
  await expect(create).toBeEnabled()

  // A very large value is accepted as-is, with no error and saving allowed.
  await timeout.fill('2000000000')
  await expect(timeout).toHaveValue('2000000000')
  await expect(timeoutErr).toBeHidden()
  await expect(create).toBeEnabled()

  // Save a large value and confirm it round-trips (6,000,000s → 100000m).
  await timeout.fill('6000000')
  await submitNewTask(page)
  await page.getByText(name).first().click()
  await expect(page.getByText('timeout 100000m').first()).toBeVisible()
  await reopenEditor(page)
  await expect(page.locator('input[type="number"]')).toHaveValue('6000000')

  // The 1-second minimum also round-trips.
  await page.locator('input[type="number"]').fill('1')
  await saveChanges(page)
  await expect(page.getByText('timeout 1s').first()).toBeVisible()
  await reopenEditor(page)
  await expect(page.locator('input[type="number"]')).toHaveValue('1')
})
