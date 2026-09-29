import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate, formatDuration, formatMonth, formatNumber, localDayKey, splitDuration } from './format'

describe('date formatting', () => {
  const d = new Date(2026, 8, 28, 10, 22)
  it('formats long dates per locale', () => {
    expect(formatDate(d, 'pt')).toBe('28 de setembro de 2026')
    expect(formatDate(d, 'en')).toBe('September 28, 2026')
    expect(formatDate(null, 'pt')).toBe('')
    expect(formatDate('garbage', 'pt')).toBe('')
  })
  it('formats month headers', () => {
    expect(formatMonth('2026-09', 'pt')).toBe('setembro de 2026')
    expect(formatMonth('2026-09', 'en')).toBe('September 2026')
  })
  it('builds local day keys', () => {
    expect(localDayKey(d)).toBe('2026-09-28')
  })
})

describe('other formatters', () => {
  it('formats durations', () => {
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(3_723_000)).toBe('1:02:03')
    expect(formatDuration(null)).toBe('')
  })
  it('formats numbers and bytes', () => {
    expect(formatNumber(12458, 'en')).toBe('12,458')
    expect(formatNumber(12458, 'pt').replace(/\s/g, ' ')).toBe('12 458')
    expect(formatBytes(512, 'en')).toBe('512 B')
    expect(formatBytes(3_481_223, 'en')).toBe('3.3 MB')
  })
  it('splits durations', () => {
    expect(splitDuration(3725)).toEqual({ h: 1, m: 2, s: 5 })
  })
})
