// E2E: drive the real backend through the renderer's own api bridge to create a
// task + workflow, launch a run, and watch it reach `succeeded`. This exercises
// the full stack (Electron main → Python backend → runner subprocess) without
// depending on exact DOM markup, which the UI specs cover separately.
import { test, expect } from './electron.fixture.js'

test('a launched workflow runs to success', async ({ page }) => {
  await page.waitForFunction(() => !!window.backend?.httpUrl, null, { timeout: 30_000 })

  const status = await page.evaluate(async () => {
    const base = window.backend.httpUrl
    const post = (p, body) =>
      fetch(base + p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json())
    const get = (p) => fetch(base + p).then((r) => r.json())

    const task = await post('/tasks', {
      name: 'e2e-echo',
      steps: [{ name: 'run', lang: 'bash', code: 'echo e2e-ok' }],
    })
    const wf = await post('/workflows', {
      name: 'e2e-run',
      stages: [{ tasks: [{ task_id: task.id }] }],
    })
    const run = await post('/executions', { workflow_id: wf.id })

    let s = run.status
    for (let i = 0; i < 100 && !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(s); i++) {
      await new Promise((r) => setTimeout(r, 100))
      s = (await get('/executions/' + run.id)).status
    }
    return s
  })

  expect(status).toBe('succeeded')
})
