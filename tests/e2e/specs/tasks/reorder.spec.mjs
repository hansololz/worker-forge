// E2E — group "Reorder" (see CUJ.md), CUJ-REORDER-1. Reorders a task's
// steps with the up/down controls and confirms the order both updates live in
// the editor and persists to the saved task. Covers several arrangements.
import { test, expect } from '../../electron.fixture.mjs'
import { gotoTasks, openNewTask, setTaskName, addStep, moveStep, expectMoveButtons, stepNames, submitNewTask } from '../../helpers/tasks.mjs'

// The three default step names of a fresh task once two python steps are added.
const A = 'bash-script.sh'
const B = 'python_script_1.py'
const C = 'python_script_2.py'

// Each arrangement: a sequence of moves applied to [A, B, C] and the order it
// should yield. Together they exercise single/double moves, up and down.
const ARRANGEMENTS = [
  { name: 'cuj-task-5-a', moves: [[C, 'up'], [C, 'up']], expected: [C, A, B] },
  { name: 'cuj-task-5-b', moves: [[A, 'down'], [A, 'down']], expected: [B, C, A] },
  { name: 'cuj-task-5-c', moves: [[C, 'up']], expected: [A, C, B] },
]

test('CUJ-REORDER-1 — reorder steps and persist the order', async ({ page }) => {
  await expect(page.getByText('Tasks').first()).toBeVisible({ timeout: 30_000 })

  for (const { name, moves, expected } of ARRANGEMENTS) {
    await gotoTasks(page)
    await openNewTask(page)
    await setTaskName(page, name)

    // Build the three-step starting point: bash default + two python steps.
    await page.getByRole('button', { name: /^Steps/ }).click()
    await addStep(page, 'python')
    await addStep(page, 'python')
    expect(await stepNames(page)).toEqual([A, B, C])

    // Boundary controls: the first step can't move up, the last can't move down,
    // the middle step can move both ways.
    await expectMoveButtons(page, A, { up: false, down: true })
    await expectMoveButtons(page, B, { up: true, down: true })
    await expectMoveButtons(page, C, { up: true, down: false })

    // Apply the moves; the editor order updates live.
    for (const [step, dir] of moves) await moveStep(page, step, dir)
    expect(await stepNames(page)).toEqual(expected)

    // The disabled boundaries track the new order: new first/last are pinned.
    await expectMoveButtons(page, expected[0], { up: false, down: true })
    await expectMoveButtons(page, expected[2], { up: true, down: false })

    // Save, reopen the task, and confirm the saved order matches.
    await submitNewTask(page)
    await page.getByText(name).first().click()
    expect(await stepNames(page)).toEqual(expected)
  }
})
