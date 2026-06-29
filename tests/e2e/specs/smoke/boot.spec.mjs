// E2E — group "Boot" (see CUJ.md), CUJ-BOOT-1. The first thing any user sees:
// the app launches and the renderer paints the primary navigation.
import { test, expect } from '../../electron.fixture.mjs'

test('CUJ-BOOT-1 — app boots to the main shell', async ({ page }) => {
  // The sidebar nav is the anchor of the shell — wait for a primary view label.
  await expect(page.getByText('Workflows').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Tasks').first()).toBeVisible()
  await expect(page.getByText('Settings').first()).toBeVisible()
})
