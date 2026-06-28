// Playwright fixture: launch the built Electron app with a sandboxed data dir.
//
// `electronApp` spawns out/main/index.js (which itself spawns the Python backend
// on a free port and waits for /api/health). `page` is the renderer window —
// available even before the splash hands off, since the BrowserWindow exists
// hidden. WORKER_FORGE_HOME is redirected to a throwaway dir so E2E never touches
// real data.
import { test as base, _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

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
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  },
})

export const expect = test.expect
