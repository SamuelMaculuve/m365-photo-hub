import { describe, expect, it } from 'vitest'
import { buildTimelineRows, computeGridMetrics, findMonthRowIndex, rowHeight, targetCellFor } from './timeline'
import { makeMedia } from '@/test/utils'

const at = (iso: string, id: number) => makeMedia(id, { sort_at: iso, taken_at: iso })

describe('buildTimelineRows', () => {
  const items = [
    at('2026-09-28T12:00:00Z', 1),
    at('2026-09-28T11:00:00Z', 2),
    at('2026-09-28T10:00:00Z', 3),
    at('2026-09-27T12:00:00Z', 4),
    at('2026-08-15T12:00:00Z', 5),
  ]

  it('groups into month headers, day headers and photo rows', () => {
    const rows = buildTimelineRows(items, 2)
    expect(rows.map((r) => r.kind)).toEqual(['month', 'day', 'photos', 'photos', 'day', 'photos', 'month', 'day', 'photos'])
    const photoRows = rows.filter((r) => r.kind === 'photos')
    expect(photoRows.map((r) => (r.kind === 'photos' ? r.items.map((m) => m.id) : []))).toEqual([[1, 2], [3], [4], [5]])
    expect(photoRows.map((r) => (r.kind === 'photos' ? r.start : -1))).toEqual([0, 2, 3, 4])
    expect(rows[0]).toMatchObject({ kind: 'month', month: '2026-09' })
    expect(findMonthRowIndex(rows, '2026-08')).toBe(6)
  })

  it('produces flat rows without headers when grouping is disabled', () => {
    const rows = buildTimelineRows(items, 3, { groupByDay: false, monthHeaders: false })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.kind === 'photos')).toBe(true)
  })

  it('handles empty input and invalid dates', () => {
    expect(buildTimelineRows([], 4)).toEqual([])
    const rows = buildTimelineRows([makeMedia(9, { sort_at: 'not-a-date' })], 4)
    expect(rows[0]).toMatchObject({ kind: 'month', month: 'unknown' })
  })

  it('keeps row keys unique', () => {
    const rows = buildTimelineRows(items, 1)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })

  it('builds rows for 100 000 items quickly and preserves every item', () => {
    const start = Date.UTC(2026, 8, 28, 12)
    const big = Array.from({ length: 100_000 }, (_, i) => {
      const iso = new Date(start - i * 45 * 60_000).toISOString() // ~32 por dia
      return makeMedia(i + 1, { sort_at: iso, taken_at: iso })
    })
    const t0 = performance.now()
    const rows = buildTimelineRows(big, 7)
    const elapsed = performance.now() - t0
    const count = rows.reduce((s, r) => s + (r.kind === 'photos' ? r.items.length : 0), 0)
    expect(count).toBe(100_000)
    expect(rows.filter((r) => r.kind === 'photos').every((r) => r.kind === 'photos' && r.items.length <= 7)).toBe(true)
    expect(elapsed).toBeLessThan(1500)
  })
})

describe('grid metrics', () => {
  it('computes columns from container width and target cell size', () => {
    expect(targetCellFor(390)).toBe(110)
    expect(targetCellFor(1440)).toBe(180)
    const m = computeGridMetrics(1200, 180, 4)
    expect(m.columns).toBe(6)
    expect(m.cellSize).toBe(Math.floor((1200 - 20) / 6))
    expect(computeGridMetrics(0, 180).columns).toBe(2)
  })

  it('returns row heights per row kind', () => {
    const m = computeGridMetrics(1000, 180)
    expect(rowHeight({ kind: 'month', key: 'm', month: '2026-09' }, m)).toBeGreaterThan(rowHeight({ kind: 'day', key: 'd', day: 'x', date: '' }, m))
    expect(rowHeight({ kind: 'photos', key: 'p', start: 0, items: [] }, m)).toBe(m.cellSize + m.gap)
  })
})
