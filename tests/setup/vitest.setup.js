// Global test setup for renderer unit tests.
//
// api.js reads `window.backend.httpUrl` at import time (the preload bridge
// supplies it in the real app). Provide a deterministic value before any test
// module imports api.js so request URLs are predictable.
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

if (typeof window !== 'undefined') {
  window.backend = window.backend || { httpUrl: 'http://127.0.0.1:8765/api' }
}

afterEach(() => {
  cleanup()
})
