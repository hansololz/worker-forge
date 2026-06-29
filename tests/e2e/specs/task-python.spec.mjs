// E2E — group "Creating a task" (see CUJ.md), CUJ-TASK-3. Drives the real task
// editor through the renderer: Tasks → New task → Steps (Python) → Create task,
// then reopens the saved task to confirm the edited python step persisted.
import { test, expect } from '../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addPythonStep, setPythonStepCode, submitNewTask } from '../helpers/tasks.mjs'

test('CUJ-TASK-3 — create a task with a python script', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })
  await gotoTasks(page)
  await openNewTask(page)

  const name = 'cuj-task-3'
  await setTaskName(page, name)

  // Add a Python step (python_script_1.py) and edit its code input.
  await addPythonStep(page)
  const marker = 'worker-forge-py-ok'
  const code = [
    '#!/usr/bin/env python3',
    'import sys',
    '',
    '',
    'def main() -> int:',
    `    print("${marker}")`,
    '    return 0',
    '',
    '',
    'if __name__ == "__main__":',
    '    sys.exit(main())',
  ].join('\n')
  await setPythonStepCode(page, code)

  await submitNewTask(page)

  // The saved task appears in the library by name.
  await expect(page.getByRole('button', { name: 'New task' })).toBeVisible()
  await expect(page.getByText(name).first()).toBeVisible()

  // Open the task detail and confirm the python step kept its name and edited
  // code rather than the default template body.
  await page.getByText(name).first().click()
  await expect(page.getByText('python_script_1.py').first()).toBeVisible()
  await page.getByText('python_script_1.py').first().click()
  await expect(page.getByText(marker).first()).toBeVisible()
})
