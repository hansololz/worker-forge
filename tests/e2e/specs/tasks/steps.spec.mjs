// E2E — group "Steps" (see CUJ.md), CUJ-STEPS-1. Exercises the Steps
// tab of the task editor: adding steps (with sensible default names), deleting
// them, and the invariant that a task must keep at least one step.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addStep, deleteStep, submitNewTask } from '../../helpers/tasks.mjs'

const NEEDS_ONE = 'A task needs at least one step'

test('CUJ-STEPS-1 — add and delete steps; the last step is undeletable', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-task-4'
  await setTaskName(page, name)
  await page.getByRole('button', { name: /^Steps/ }).click()

  // A new task starts with one bash step under a sensible default name.
  await expect(page.getByText('bash-script.sh').first()).toBeVisible()
  // With a single step, its delete is disabled — a task must keep one step.
  await expect(page.getByRole('button', { name: NEEDS_ONE })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete step' })).toHaveCount(0)

  // Adding steps yields clean, incrementing default names.
  await addStep(page, 'python')
  await expect(page.getByText('python_script_1.py').first()).toBeVisible()
  await addStep(page, 'python')
  await expect(page.getByText('python_script_2.py').first()).toBeVisible()

  // With more than one step, every step becomes deletable (no guard remains)
  // and each delete control is enabled.
  await expect(page.getByRole('button', { name: NEEDS_ONE })).toHaveCount(0)
  const deletes = page.getByRole('button', { name: 'Delete step' })
  await expect(deletes).toHaveCount(3)
  for (const btn of await deletes.all()) await expect(btn).toBeEnabled()

  // Delete the added steps back down to the single default step.
  await deleteStep(page, 'python_script_2.py')
  await deleteStep(page, 'python_script_1.py')

  // Back to one step: the delete guard returns and the default step survives.
  await expect(page.getByText('bash-script.sh').first()).toBeVisible()
  await expect(page.getByRole('button', { name: NEEDS_ONE })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Delete step' })).toHaveCount(0)

  // The task still saves, carrying its single default step.
  await submitNewTask(page)
  await expect(page.getByText(name).first()).toBeVisible()
})
