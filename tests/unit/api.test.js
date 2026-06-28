// Unit: api.js HTTP client — correct method/URL/body, error + 204 handling.
// fetch is stubbed; no network.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../../src/api.js'

const BASE = 'http://127.0.0.1:8765/api'

function mockFetch(impl) {
  global.fetch = vi.fn(impl)
}
const ok = (body) => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => body,
})

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('api request shaping', () => {
  it('GET list hits /workflows', async () => {
    mockFetch(async () => ok([{ id: 'a' }]))
    const out = await api.listWorkflows()
    expect(out).toEqual([{ id: 'a' }])
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/workflows`)
    expect(opts.method).toBe('GET')
  })

  it('POST create sends JSON body', async () => {
    mockFetch(async () => ok({ id: 'new' }))
    await api.createWorkflow({ name: 'X' })
    const [url, opts] = global.fetch.mock.calls[0]
    expect(url).toBe(`${BASE}/workflows`)
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ name: 'X' })
    expect(opts.headers['Content-Type']).toMatch(/application\/json/)
  })

  it('interpolates ids into the path', async () => {
    mockFetch(async () => ok({ id: 'wf1' }))
    await api.getWorkflow('wf1')
    expect(global.fetch.mock.calls[0][0]).toBe(`${BASE}/workflows/wf1`)
  })

  it('task-scoped controls build the nested path', async () => {
    mockFetch(async () => ok({}))
    await api.retryTask('e1', 0, 2)
    expect(global.fetch.mock.calls[0][0]).toBe(`${BASE}/executions/e1/tasks/0/2/retry`)
  })

  it('returns null on 204 No Content', async () => {
    mockFetch(async () => ({ ok: true, status: 204 }))
    expect(await api.deleteWorkflow('x')).toBeNull()
  })

  it('throws with the backend detail on error', async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) }))
    await expect(api.getWorkflow('x')).rejects.toThrow(/boom/)
  })
})
