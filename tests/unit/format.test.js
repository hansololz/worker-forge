// Unit: pure display formatters (timezone-independent ones).
import { describe, it, expect } from 'vitest'
import { fmtDurSec, fmtAgeIso } from '../../src/model.js'

describe('fmtDurSec', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(fmtDurSec(0)).toBe('0m 00s')
    expect(fmtDurSec(65)).toBe('1m 05s')
    expect(fmtDurSec(125)).toBe('2m 05s')
  })
  it('rounds fractional seconds', () => {
    expect(fmtDurSec(9.6)).toBe('0m 10s')
  })
  it('renders em-dash for null', () => {
    expect(fmtDurSec(null)).toBe('—')
  })
})

describe('fmtAgeIso', () => {
  it('em-dash for empty', () => {
    expect(fmtAgeIso(null)).toBe('—')
  })
  it('just now for < 1 minute', () => {
    expect(fmtAgeIso(new Date(Date.now() - 5_000).toISOString())).toBe('just now')
  })
  it('minutes / hours / days ago', () => {
    expect(fmtAgeIso(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5m ago')
    expect(fmtAgeIso(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3h ago')
    expect(fmtAgeIso(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2d ago')
  })
})
