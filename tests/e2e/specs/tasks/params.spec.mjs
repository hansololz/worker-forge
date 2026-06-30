// E2E — group "Params" (see CUJ.md), CUJ-PARAMS-1/2/3. Exercises the task
// Parameters editor (env vars, the EnvTab below the Steps list): adding several
// parameters, setting each one's name/value/required, editing and removing them,
// and confirming every change round-trips to the saved task. Also covers the
// per-row validation that blocks saving.
import { test, expect } from '../../electron.fixture.mjs'
import {
  gotoTasks, openNewTask, setTaskName, submitNewTask, saveChanges, reopenEditor,
  addParam, setParamKey, setParamValue, toggleParamRequired, deleteParam,
  paramRow,
} from '../../helpers/tasks.mjs'

// Assert a parameter, by key, as shown on the task detail's Parameters card.
async function expectDetailParam(page, key, { required, value }) {
  const row = page.locator('.prep-row').filter({ hasText: key })
  await expect(row.locator('.param-key')).toHaveText(key)
  await expect(row.locator('.param-req')).toHaveText(required ? 'required' : 'optional')
  await expect(row.locator('.prep-v .mono')).toHaveText(value === '' ? 'no default' : value)
}

// Assert a parameter row in the editor (by index) holds the given key/value and
// required state.
async function expectEditorParam(page, i, { k, v, required }) {
  const row = paramRow(page, i)
  await expect(row.locator('input.mono').nth(0)).toHaveValue(k)
  await expect(row.locator('input.mono').nth(1)).toHaveValue(v)
  await expect(row.locator('button.req-toggle')).toHaveText(required ? 'required' : 'optional')
}

test('CUJ-PARAMS-1 — add multiple parameters; name, value, required all persist', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'params-add')

  // Three parameters spanning the field combinations: required + default,
  // optional + default, and required with no default.
  await addParam(page, { k: 'API_URL', v: 'https://api.example.com', required: true })
  await addParam(page, { k: 'RETRIES', v: '3', required: false })
  await addParam(page, { k: 'TOKEN', v: '', required: true })
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(3)

  await submitNewTask(page)

  // The saved task detail's Parameters card lists all three with their state.
  await page.getByText('params-add').first().click()
  await expect(page.getByText('3 variables').first()).toBeVisible()
  await expectDetailParam(page, 'API_URL', { required: true, value: 'https://api.example.com' })
  await expectDetailParam(page, 'RETRIES', { required: false, value: '3' })
  await expectDetailParam(page, 'TOKEN', { required: true, value: '' })

  // Reopening the editor shows every parameter's key, value, and required flag.
  await reopenEditor(page)
  await page.getByRole('button', { name: /^Steps/ }).click()
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(3)
  await expectEditorParam(page, 0, { k: 'API_URL', v: 'https://api.example.com', required: true })
  await expectEditorParam(page, 1, { k: 'RETRIES', v: '3', required: false })
  await expectEditorParam(page, 2, { k: 'TOKEN', v: '', required: true })
})

test('CUJ-PARAMS-2 — edit parameters: rename, revalue, flip required, add, remove', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'params-edit')

  // Start with two parameters, then save the baseline task.
  await addParam(page, { k: 'HOST', v: 'localhost', required: false })
  await addParam(page, { k: 'PORT', v: '8080', required: true })
  await submitNewTask(page)

  // Re-edit: rename HOST→ENDPOINT, change its value and make it required; flip
  // PORT to optional and revalue it; add a third param; then remove ENDPOINT.
  await page.getByText('params-edit').first().click()
  await reopenEditor(page)
  await page.getByRole('button', { name: /^Steps/ }).click()

  await setParamKey(page, 0, 'ENDPOINT')
  await setParamValue(page, 0, 'https://svc.internal')
  await toggleParamRequired(page, 0)   // HOST was optional → now required

  await setParamValue(page, 1, '9090')
  await toggleParamRequired(page, 1)   // PORT was required → now optional

  await addParam(page, { k: 'TIMEOUT', v: '30', required: true })
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(3)

  await deleteParam(page, 0)           // remove the renamed first row
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(2)

  await saveChanges(page)

  // Detail reflects every edit: ENDPOINT is gone, PORT/TIMEOUT carry new state.
  await expect(page.getByText('2 variables').first()).toBeVisible()
  await expect(page.locator('.prep-row').filter({ hasText: 'ENDPOINT' })).toHaveCount(0)
  await expect(page.locator('.prep-row').filter({ hasText: 'HOST' })).toHaveCount(0)
  await expectDetailParam(page, 'PORT', { required: false, value: '9090' })
  await expectDetailParam(page, 'TIMEOUT', { required: true, value: '30' })

  // And the reopened editor shows the same two surviving parameters.
  await reopenEditor(page)
  await page.getByRole('button', { name: /^Steps/ }).click()
  await expect(page.locator('input[placeholder="KEY"]')).toHaveCount(2)
  await expectEditorParam(page, 0, { k: 'PORT', v: '9090', required: false })
  await expectEditorParam(page, 1, { k: 'TIMEOUT', v: '30', required: true })
})

test('CUJ-PARAMS-3 — invalid, duplicate, and blank-key parameters block or drop on save', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'params-validate')

  const create = page.getByRole('button', { name: 'Create task' })

  // A key that starts with a digit is rejected and blocks saving.
  await addParam(page, { k: '1BAD', v: 'x' })
  await expect(page.getByText("Letters, digits, underscore — can't start with a digit")).toBeVisible()
  await expect(create).toBeDisabled()
  await setParamKey(page, 0, 'GOOD')
  await expect(create).toBeEnabled()

  // A second row duplicating the first key is flagged and blocks saving.
  await addParam(page, { k: 'GOOD', v: 'y' })
  // Both rows are flagged as duplicates; assert at least the first is shown.
  await expect(page.getByText('Duplicate key').first()).toBeVisible()
  await expect(create).toBeDisabled()

  // A blank key carrying a value is "Key required" and still blocks saving.
  await setParamKey(page, 1, '')
  await expect(page.getByText('Key required')).toBeVisible()
  await expect(create).toBeDisabled()

  // Clearing that row's value makes it an empty row — valid, and dropped on save.
  await setParamValue(page, 1, '')
  await expect(page.getByText('Key required')).toBeHidden()
  await expect(create).toBeEnabled()

  await submitNewTask(page)

  // Only the one named parameter persists; the empty row was not saved.
  await page.getByText('params-validate').first().click()
  await expect(page.getByText('1 variable').first()).toBeVisible()
  await expectDetailParam(page, 'GOOD', { required: false, value: 'x' })
})
