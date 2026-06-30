// E2E — group "Prepare" (see CUJ.md), CUJ-PREPARE-1. A task's required
// parameters only bite at run time: the run-prepare page must surface every
// required field left without a value before the flow can start. This builds a
// task with two required (no-default) params plus one optional, references it
// from a workflow, opens run-prepare, and confirms the missing-required warning
// is visible — the banner, the per-row alert, and the disabled "Run flow" — and
// that filling the values clears it.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addParam, submitNewTask } from '../../helpers/tasks.mjs'
import { createWorkflowWithTask, openRunPrepare } from '../../helpers/workflows.mjs'

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
