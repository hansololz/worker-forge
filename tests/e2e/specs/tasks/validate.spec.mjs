// E2E — group "Task-Validate" (see CUJ.md), CUJ-TASK-VALIDATE-1. A task needs a
// non-empty name to save: the name-required banner shows and Create task is
// disabled until a name is entered.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName } from '../../helpers/tasks.mjs'

test('CUJ-TASK-VALIDATE-1 — a name is required to create a task', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  // A blank new task shows the name-required error and blocks Create task.
  const create = page.getByRole('button', { name: 'Create task' })
  await expect(page.getByText('Task name is required.')).toBeVisible()
  await expect(create).toBeDisabled()

  // Entering a name clears the error and enables saving.
  await setTaskName(page, 'named-task')
  await expect(page.getByText('Task name is required.')).toBeHidden()
  await expect(create).toBeEnabled()

  // Clearing it again re-blocks saving.
  await setTaskName(page, '')
  await expect(page.getByText('Task name is required.')).toBeVisible()
  await expect(create).toBeDisabled()
})
