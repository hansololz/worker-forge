import { defineConfig } from '@playwright/test'

// Electron E2E. The app is launched inside each spec via the `_electron` driver
// (see tests/e2e/electron.fixture.js), so no webServer is configured here.
// Requires a prior `npm run build` (renderer + main bundled into out/) and a
// runnable Python backend (backend/.venv or python3 on PATH). In Docker the
// run is wrapped in xvfb-run for a virtual display.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
})
