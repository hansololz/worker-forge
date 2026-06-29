// E2E — group "Creating a task" (see CUJ.md). Drives the real task editor
// through the renderer: Tasks → New task → Config/Steps → Create task.
import { test, expect } from '../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, setStepCode, submitNewTask } from '../helpers/tasks.mjs'

test('CUJ-TASK-1 — create a task with a name', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  // Create is disabled while the name is blank, then enables once a name exists.
  const create = page.getByRole('button', { name: 'Create task' })
  await expect(create).toBeDisabled()
  const name = 'cuj-task-1'
  await setTaskName(page, name)
  await expect(create).toBeEnabled()

  await submitNewTask(page)

  // The saved task appears in the library by name.
  await expect(page.getByRole('button', { name: 'New task' })).toBeVisible()
  await expect(page.getByText(name).first()).toBeVisible()
})

test('CUJ-TASK-2 — create a task with an edited script', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-task-2'
  await setTaskName(page, name)
  const edited = 'echo edited-ok'
  await setStepCode(page, edited)
  await submitNewTask(page)

  // Open the task detail, expand the step (collapsed by default), and confirm it
  // carries the edited code rather than the default template body.
  await expect(page.getByText(name).first()).toBeVisible()
  await page.getByText(name).first().click()
  await page.getByText('bash-script.sh').first().click()
  await expect(page.getByText(edited).first()).toBeVisible()
})
