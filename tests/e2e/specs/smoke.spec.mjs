// E2E smoke: the app boots, the backend comes up, the renderer paints the shell.
import { test, expect } from '../electron.fixture.mjs'

test('app launches and renders the main shell', async ({ page }) => {
  // The sidebar nav is the anchor of the shell — wait for a primary view label.
  await expect(page.getByText('Workflows').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Tasks').first()).toBeVisible()
  await expect(page.getByText('Settings').first()).toBeVisible()
})

test('backend is reachable from the renderer', async ({ page }) => {
  // window.backend.httpUrl is injected by preload; hit /health through it.
  const status = await page.evaluate(async () => {
    const base = window.backend.httpUrl
    const r = await fetch(base.replace(/\/api$/, '/api/health'))
    return (await r.json()).status
  })
  expect(status).toBe('ok')
})
