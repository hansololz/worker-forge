// Boot the Python backend on an ephemeral port for local integration / e2e runs.
// Docker and CI run the backend as a separate service instead; this helper is for
// `node tests/setup/backend-server.js` style local use and the e2e fixture.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:net'

const ROOT = join(import.meta.dirname, '..', '..')

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function waitHealthy(url, timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${url}/health`)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('backend did not become healthy')
}

// Returns { url, stop() }. `home` sandboxes WORKER_FORGE_HOME.
export async function startBackend({ home } = {}) {
  const port = await freePort()
  const venvPy = join(ROOT, 'engine', '.venv', 'bin', 'python')
  const cmd = existsSync(venvPy) ? venvPy : 'python3'
  const proc = spawn(cmd, ['run.py', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: join(ROOT, 'engine'),
    env: { ...process.env, ...(home ? { WORKER_FORGE_HOME: home } : {}) },
    stdio: 'inherit',
  })
  const url = `http://127.0.0.1:${port}/api`
  await waitHealthy(url)
  return {
    url,
    stop: () => proc.kill(),
  }
}
