/* ============================================================
   HTTP client for the local backend (SPEC §6). All endpoints under /api.
   The Electron preload injects window.backend.httpUrl with the live port;
   fall back to the default dev port when running the renderer standalone.
   ============================================================ */

const BASE = (typeof window !== 'undefined' && window.backend && window.backend.httpUrl)
  ? window.backend.httpUrl
  : 'http://127.0.0.1:8765/api'

async function req(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    let detail = res.statusText
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j) } catch { /* ignore */ }
    throw new Error(`${method} ${path} → ${res.status}: ${detail}`)
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : res.text()
}

export const api = {
  // Workflows (§6.2)
  listWorkflows: (q) => req('GET', '/workflows' + qs(q)),
  createWorkflow: (body) => req('POST', '/workflows', body),
  getWorkflow: (id) => req('GET', `/workflows/${id}`),
  getWorkflowVersion: (id, n) => req('GET', `/workflows/${id}/versions/${n}`),
  saveWorkflowVersion: (id, body) => req('POST', `/workflows/${id}/versions`, body),
  deleteWorkflow: (id) => req('DELETE', `/workflows/${id}`),

  // Triggers (§6.3): the UI saves triggers by folding them into one workflow
  // version via saveWorkflowVersion (see model.js saveTriggers), so the standalone
  // per-trigger endpoints have no client methods. They remain a first-class API
  // resource on the backend.

  // Tasks (§6.4)
  listTasks: () => req('GET', '/tasks'),
  createTask: (body) => req('POST', '/tasks', body),
  getTask: (id) => req('GET', `/tasks/${id}`),
  getTaskVersion: (id, n) => req('GET', `/tasks/${id}/versions/${n}`),
  saveTaskVersion: (id, body) => req('POST', `/tasks/${id}/versions`, body),
  deleteTask: (id) => req('DELETE', `/tasks/${id}`),

  // Executions (§6.5)
  listExecutions: (q) => req('GET', '/executions' + qs(q)),
  launchExecution: (body) => req('POST', '/executions', body),
  getExecution: (id) => req('GET', `/executions/${id}`),
  getLog: (execId, logId) => req('GET', `/executions/${execId}/logs/${logId}`),
  cancelExecution: (id) => req('POST', `/executions/${id}/cancel`),
  retryFromFailure: (id) => req('POST', `/executions/${id}/retry-from-failure`),
  skipFailed: (id) => req('POST', `/executions/${id}/skip-failed`),
  // Task-scoped controls (single task within a run), addressed by position.
  cancelTask: (id, si, ti) => req('POST', `/executions/${id}/tasks/${si}/${ti}/cancel`),
  skipTask: (id, si, ti) => req('POST', `/executions/${id}/tasks/${si}/${ti}/skip`),
  retryTask: (id, si, ti) => req('POST', `/executions/${id}/tasks/${si}/${ti}/retry`),

  // Settings / data directory (§6.6)
  getSettings: () => req('GET', '/settings'),
  patchSettings: (body) => req('PATCH', '/settings', body),
  setDataDirectory: (path) => req('POST', '/settings/data-directory', { path }),
  setExecutionsPath: (path) => req('POST', '/settings/executions', { path }),
  setWorkspacePath: (path) => req('POST', '/settings/workspace', { path }),
}

function qs(q) {
  if (!q) return ''
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
  return parts.length ? '?' + parts.join('&') : ''
}
