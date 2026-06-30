// E2E — group "Usage" (see CUJ.md), CUJ-USAGE-1/2. A task is shared across
// workflows; the app must (1) refuse to delete a task while a workflow still
// references it, and (2) show an accurate "Used by" list on the task detail.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, submitNewTask, reopenEditor } from '../../helpers/tasks.mjs'
import {
  gotoWorkflows, createWorkflowWithTask, openNewWorkflow, setWorkflowName,
  addTaskToStageN, removeTaskFromStageN,
} from '../../helpers/workflows.mjs'

async function makeTask(page, name) {
  await gotoTasks(page)
  await openNewTask(page)
  await setTaskName(page, name)
  await submitNewTask(page)
}

// Open a task's detail from the Tasks library.
async function openTaskDetail(page, name) {
  await gotoTasks(page)
  await page.getByText(name, { exact: true }).first().click()
}

// The "Used by" card on the task detail.
const usedByCard = (page) => page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Used by' }) })

test('CUJ-USAGE-1 — a task cannot be deleted while a workflow uses it', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // A task to delete and a second task so the workflow stays valid after removal.
  await makeTask(page, 'del-task')
  await makeTask(page, 'keep-task')

  // A workflow whose single stage references both tasks.
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-del')
  await addTaskToStageN(page, 0, 'del-task')
  await addTaskToStageN(page, 0, 'keep-task')
  await page.getByRole('button', { name: 'Create workflow' }).click()

  // While in use, the editor's Delete task button is disabled with an explanatory
  // hint, and cannot open the confirm modal.
  await openTaskDetail(page, 'del-task')
  await reopenEditor(page)
  await page.getByRole('button', { name: 'Config' }).click()
  const del = page.getByRole('button', { name: 'Delete task' })
  await expect(del).toBeDisabled()
  await expect(del).toHaveAttribute('title', "Can't delete — still in use")
  await expect(page.getByText('In use by 1 workflow')).toBeVisible()

  // Remove the task from the workflow (keep-task remains, so the save is valid).
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-del' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await removeTaskFromStageN(page, 0, 'del-task')
  await page.getByRole('button', { name: 'Save changes' }).click()

  // No longer referenced: delete is now enabled, and the task can be deleted.
  await openTaskDetail(page, 'del-task')
  await reopenEditor(page)
  await page.getByRole('button', { name: 'Config' }).click()
  await expect(page.getByText("isn't used by any workflow")).toBeVisible()
  const del2 = page.getByRole('button', { name: 'Delete task' })
  await expect(del2).toBeEnabled()
  await del2.click()
  await page.locator('.modal-card').getByRole('button', { name: 'Delete task' }).click()

  // It's gone from the Tasks library.
  await gotoTasks(page)
  await expect(page.getByText('del-task', { exact: true })).toHaveCount(0)
})

test('CUJ-USAGE-2 — the task "Used by" list accurately tracks referencing workflows', async ({ page }) => {
  test.slow()
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  // The shared task plus a filler so a workflow can drop the shared task and stay valid.
  await makeTask(page, 'shared-task')
  await makeTask(page, 'filler-task')

  // Initially used by nothing.
  await openTaskDetail(page, 'shared-task')
  await expect(usedByCard(page)).toContainText('0 workflows')
  await expect(usedByCard(page)).toContainText('Not used in any workflow yet.')

  // Workflow A references it (alongside the filler in the same stage).
  await gotoWorkflows(page)
  await openNewWorkflow(page)
  await setWorkflowName(page, 'wf-A')
  await addTaskToStageN(page, 0, 'shared-task')
  await addTaskToStageN(page, 0, 'filler-task')
  await page.getByRole('button', { name: 'Create workflow' }).click()

  await openTaskDetail(page, 'shared-task')
  await expect(usedByCard(page)).toContainText('1 workflow')
  await expect(usedByCard(page).locator('.step-item')).toHaveCount(1)
  await expect(usedByCard(page).locator('.step-item .n')).toHaveText('wf-A')

  // Workflow B also references it.
  await createWorkflowWithTask(page, { name: 'wf-B', taskName: 'shared-task' })

  await openTaskDetail(page, 'shared-task')
  await expect(usedByCard(page)).toContainText('2 workflows')
  await expect(usedByCard(page).locator('.step-item')).toHaveCount(2)
  await expect(usedByCard(page).locator('.step-item .n')).toHaveText(['wf-A', 'wf-B'])

  // Remove the shared task from workflow A; the list drops to just B.
  await gotoWorkflows(page)
  await page.locator('.wf-row', { hasText: 'wf-A' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await removeTaskFromStageN(page, 0, 'shared-task')
  await page.getByRole('button', { name: 'Save changes' }).click()

  await openTaskDetail(page, 'shared-task')
  await expect(usedByCard(page)).toContainText('1 workflow')
  await expect(usedByCard(page).locator('.step-item')).toHaveCount(1)
  await expect(usedByCard(page).locator('.step-item .n')).toHaveText('wf-B')
})
