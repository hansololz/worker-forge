// Playwright fixture: launch the built Electron app with a sandboxed data dir.
//
// `electronApp` spawns out/main/index.js (which itself spawns the Python backend
// on a free port and waits for /api/health). The app opens a branded splash
// window first (a data: URL with no preload), then the main window (which loads
// the renderer + the `window.backend` preload bridge). `page` resolves to the
// MAIN window — identified by the presence of `window.backend` — never the
// splash. WORKER_FORGE_HOME is redirected to a throwaway dir so E2E never
// touches real data.
import { test as base, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

// Resolve the main renderer window: poll every open window until one exposes the
// `window.backend` preload bridge (the splash has no preload, so it never will).
async function mainWindow(app, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    for (const w of app.windows()) {
      const ok = await w.evaluate(() => !!window.backend).catch(() => false)
      if (ok) return w
    }
    if (Date.now() > deadline) {
      throw new Error('main window (window.backend bridge) never appeared')
    }
    await app.waitForEvent('window', { timeout: 1000 }).catch(() => {})
  }
}

export const test = base.extend({
  electronApp: async ({}, use) => {
    const home = mkdtempSync(join(tmpdir(), 'wf-e2e-'))
    const app = await electron.launch({
      args: [join(ROOT, 'out', 'main', 'index.js')],
      env: { ...process.env, WORKER_FORGE_HOME: home },
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await mainWindow(electronApp)
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export const expect = test.expect
