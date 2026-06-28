import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Renderer unit tests run in jsdom; the FE↔BE integration test opts itself into
// the node environment via a per-file `// @vitest-environment node` pragma.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}', 'tests/integration/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      reporter: ['text', 'html'],
    },
  },
})
