// E2E — group "Backend" (see CUJ.md), CUJ-BACKEND-1. Proves the renderer can
// reach the Python engine over its preload-injected HTTP URL.
import { test, expect } from '../../electron.fixture.mjs'

test('CUJ-BACKEND-1 — backend is reachable from the renderer', async ({ page }) => {
  // window.backend.httpUrl is injected by preload; hit /health through it.
  const status = await page.evaluate(async () => {
    const base = window.backend.httpUrl
    const r = await fetch(base.replace(/\/api$/, '/api/health'))
    return (await r.json()).status
  })
  expect(status).toBe('ok')
})
