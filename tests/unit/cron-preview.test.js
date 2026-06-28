// Unit: nextCronRun — the pure client-side next-fire preview used in the
// triggers editor. Field evaluation is UTC, so these assertions are
// timezone-independent.
import { describe, it, expect } from 'vitest'
import { nextCronRun } from '../../src/model.js'

const at = (...utc) => Math.floor(Date.UTC(...utc) / 1000)

describe('nextCronRun', () => {
  it('returns null for a non-5-field expression', () => {
    expect(nextCronRun('* * *', 0)).toBeNull()
    expect(nextCronRun('', 0)).toBeNull()
    expect(nextCronRun(null, 0)).toBeNull()
  })

  it('every 5 minutes -> next 5-minute boundary', () => {
    const from = at(2026, 0, 1, 0, 0, 0)
    expect(nextCronRun('*/5 * * * *', from)).toBe(from + 300)
  })

  it('daily midnight -> next UTC midnight', () => {
    const from = at(2026, 0, 1, 12, 0, 0)
    expect(nextCronRun('0 0 * * *', from)).toBe(at(2026, 0, 2, 0, 0, 0))
  })

  it('specific minute/hour', () => {
    const from = at(2026, 0, 1, 9, 14, 0)
    expect(nextCronRun('30 9 * * *', from)).toBe(at(2026, 0, 1, 9, 30, 0))
  })

  it('returns null when nothing matches within a year', () => {
    // Feb 30 never exists.
    expect(nextCronRun('0 0 30 2 *', at(2026, 0, 1, 0, 0, 0))).toBeNull()
  })
})
