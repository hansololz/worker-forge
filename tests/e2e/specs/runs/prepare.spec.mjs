// E2E — group "Prepare" (see CUJ.md), CUJ-PREPARE-1. A task's required
// parameters only bite at run time: the run-prepare page must surface every
// required field left without a value before the flow can start. This builds a
// task with two required (no-default) params plus one optional, references it
// from a workflow, opens run-prepare, and confirms the missing-required warning
// is visible — the banner, the per-row alert, and the disabled "Run flow" — and
// that filling the values clears it.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addParam, submitNewTask } from '../../helpers/tasks.mjs'
import {
  createWorkflowWithTask, openRunPrepare,
  gotoWorkflows, openNewWorkflow, setWorkflowName,
  addTaskToStageN, openTaskPanel, setParamOverride,
} from '../../helpers/workflows.mjs'

test('CUJ-PREPARE-1 — missing required parameters are flagged before a run', async ({ page }) => {
  test.slow() // task + workflow authoring then the run-prepare round-trip
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // A task with two required params (no defaults) and one optional param.
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'needs-keys')
  await addParam(page, { k: 'API_KEY', required: true }) // required, no default
  await addParam(page, { k: 'DB_URL', required: true })  // required, no default
  await addParam(page, { k: 'REGION', required: false }) // optional, no default
  await submitNewTask(page)

  // A workflow whose single stage references that task.
  await createWorkflowWithTask(page, { name: 'wf-needs-keys', taskName: 'needs-keys' })

  // Open the run-prepare page for it.
  await openRunPrepare(page, 'wf-needs-keys')

  // Both required-but-empty params are flagged; the optional one is not. The
  // banner names exactly the missing keys and "Run flow" is blocked.
  const warn = page.locator('.prep-warn')
  await expect(warn).toBeVisible()
  await expect(warn).toContainText('2 required parameters still need a value')
  await expect(warn).toContainText('API_KEY')
  await expect(warn).toContainText('DB_URL')
  await expect(page.getByRole('button', { name: 'Run flow' })).toBeDisabled()

  // Exactly the two required rows carry the missing state (the optional doesn't),
  // and each missing input shows the "value required" placeholder.
  await expect(page.locator('.prep-row.missing')).toHaveCount(2)
  const apiRow = page.locator('.prep-row').filter({ hasText: 'API_KEY' })
  const dbRow = page.locator('.prep-row').filter({ hasText: 'DB_URL' })
  const regionRow = page.locator('.prep-row').filter({ hasText: 'REGION' })
  await expect(apiRow).toHaveClass(/missing/)
  await expect(dbRow).toHaveClass(/missing/)
  await expect(regionRow).not.toHaveClass(/missing/)
  await expect(apiRow.locator('input.miss')).toHaveAttribute('placeholder', 'value required')
  // The task card's summary chip counts the missing params.
  await expect(page.locator('.card-h.prep-card .sub')).toContainText('2 missing')

  // Filling one required param updates the warning to the remaining one; the run
  // is still blocked.
  await apiRow.locator('input.mono').fill('ak-123')
  await expect(warn).toContainText('1 required parameter still needs a value')
  await expect(warn).toContainText('DB_URL')
  await expect(warn).not.toContainText('API_KEY')
  await expect(page.locator('.prep-row.missing')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Run flow' })).toBeDisabled()

  // Filling the last required param clears the warning entirely and enables the
  // run — the optional param never blocked it.
  await dbRow.locator('input.mono').fill('postgres://db')
  await expect(page.locator('.prep-warn')).toHaveCount(0)
  await expect(page.locator('.prep-row.missing')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run flow' })).toBeEnabled()
})

test('CUJ-PREPARE-2 — run-page parameter inputs show the correct initial values', async ({ page }) => {
  test.slow() // task + workflow (with an override) authoring, then run-prepare checks
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // A task with: an optional param that has a default, a required param with no
  // default, and an optional param with no default.
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, 'prep-vals')
  await addParam(page, { k: 'HOST', v: 'localhost', required: false }) // has a default
  await addParam(page, { k: 'PORT', required: true })                  // required, no default
  await addParam(page, { k: 'DEBUG', required: false })                // optional, no default
  await submitNewTask(page)

  // A workflow referencing it, with a workflow-level override for HOST so the
  // override (not the task default) is the value seen at run time.
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-prep-vals')
  await addTaskToStageN(page, 0, 'prep-vals')
  await openTaskPanel(page, 0, 'prep-vals')
  await setParamOverride(page, 0, 'HOST', 'remote-host')
  await page.getByRole('button', { name: 'Create workflow' }).click()

  await openRunPrepare(page, 'wf-prep-vals')

  // HOST: the workflow override pre-fills the input as its value (beating the
  // task's own 'localhost' default); not flagged missing.
  const hostRow = page.locator('.prep-row').filter({ hasText: 'HOST' })
  await expect(hostRow.locator('input.mono')).toHaveValue('remote-host')
  await expect(hostRow).not.toHaveClass(/missing/)

  // PORT: required with no value — empty input, "value required" placeholder, missing.
  const portRow = page.locator('.prep-row').filter({ hasText: 'PORT' })
  await expect(portRow.locator('input.mono')).toHaveValue('')
  await expect(portRow.locator('input.mono')).toHaveAttribute('placeholder', 'value required')
  await expect(portRow).toHaveClass(/missing/)

  // DEBUG: optional with no value — empty input, "value (optional)" placeholder, not missing.
  const debugRow = page.locator('.prep-row').filter({ hasText: 'DEBUG' })
  await expect(debugRow.locator('input.mono')).toHaveValue('')
  await expect(debugRow.locator('input.mono')).toHaveAttribute('placeholder', 'value (optional)')
  await expect(debugRow).not.toHaveClass(/missing/)

  // The task card chip counts all three params and the one missing required.
  await expect(page.locator('.card-h.prep-card .sub')).toContainText('3 parameters')
  await expect(page.locator('.card-h.prep-card .sub')).toContainText('1 missing')

  // An ad-hoc parameter can be added for this run (key + "added" badge + value).
  await page.getByRole('button', { name: 'Add parameter' }).click()
  const extraRow = page.locator('.prep-row').filter({ has: page.locator('input[placeholder="PARAM_NAME"]') })
  await expect(extraRow).toBeVisible()
  await expect(extraRow.locator('.param-req')).toHaveText('added')

  // Filling the missing required value enables the launch; initial values hold.
  await portRow.locator('input.mono').fill('5432')
  await expect(hostRow.locator('input.mono')).toHaveValue('remote-host')
  await expect(page.getByRole('button', { name: 'Run flow' })).toBeEnabled()
})
