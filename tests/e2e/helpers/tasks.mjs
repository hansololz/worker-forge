// Reusable task-authoring actions for E2E specs. Encodes the journey
// "Tasks → New task → Config/Steps → Create task" once, so CUJ specs read as
// journeys instead of selector soup. See CUJ.md (group: Creating a task) and
// src/views/tasks.jsx for the UI these drive.
import { expect } from '../electron.fixture.mjs'

// Navigate to the Tasks library via the sidebar.
export async function gotoTasks(page) {
  await page.getByText('Tasks').first().click()
  await expect(page.getByRole('button', { name: 'New task' })).toBeVisible()
}

// Open the new-task editor (lands on the Config tab, titled "New task").
export async function openNewTask(page) {
  await page.getByRole('button', { name: 'New task' }).click()
  await expect(page.getByPlaceholder('Task name')).toBeVisible()
}

// Set the task name on the Config tab.
export async function setTaskName(page, name) {
  await page.getByPlaceholder('Task name').fill(name)
}

// Replace the first step's code on the Steps tab. The first step is expanded by
// default in a new task, so its editor textarea is already mounted.
export async function setStepCode(page, code) {
  await page.getByRole('button', { name: /^Steps/ }).click()
  const ta = page.locator('textarea.code-input').first()
  await expect(ta).toBeVisible()
  await ta.fill(code)
}

// Save the new task ("Create task"); returns to the Tasks library on success.
export async function submitNewTask(page) {
  await page.getByRole('button', { name: 'Create task' }).click()
}
