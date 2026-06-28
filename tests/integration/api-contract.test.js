// @vitest-environment node
//
// FE↔BE contract: runs api.js against a REAL backend to catch drift the mocked
// unit tests can't. Skips unless WF_BACKEND_URL points at a live backend
// (set by docker-compose / CI, or `npm run test:integration` after booting one).
import { describe, it, expect, beforeAll } from 'vitest'

const BACKEND = process.env.WF_BACKEND_URL // e.g. http://127.0.0.1:8765/api
const suite = BACKEND ? describe : describe.skip

let api
beforeAll(async () => {
  // api.js resolves its base URL from window.backend.httpUrl at import time.
  globalThis.window = { backend: { httpUrl: BACKEND } }
  ;({ api } = await import('../../src/api.js'))
})

suite('api.js against a live backend', () => {
  it('creates, lists and deletes a workflow', async () => {
    const created = await api.createWorkflow({ name: 'contract-test-wf' })
    expect(created.id).toBeTruthy()

    const list = await api.listWorkflows()
    expect(list.some((w) => w.id === created.id)).toBe(true)

    await api.deleteWorkflow(created.id)
    const after = await api.listWorkflows()
    expect(after.some((w) => w.id === created.id)).toBe(false)
  })

  it('round-trips a task and a real execution', async () => {
    const task = await api.createTask({
      name: 'contract-echo',
      steps: [{ name: 'run', lang: 'bash', code: 'echo contract-ok' }],
    })
    const wf = await api.createWorkflow({
      name: 'contract-run',
      stages: [{ tasks: [{ task_id: task.id }] }],
    })
    const run = await api.launchExecution({ workflow_id: wf.id })

    let status = run.status
    for (let i = 0; i < 100 && !['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 100))
      status = (await api.getExecution(run.id)).status
    }
    expect(status).toBe('succeeded')
  })
})
