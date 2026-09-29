import { describe, expect, it } from 'vitest'
import { filtersFromSearchParams, hasActiveFilters, interpretedChips, searchParamsFromFilters, searchUrl } from './search'

describe('search helpers', () => {
  it('parses filters from the URL and ignores invalid values', () => {
    const sp = new URLSearchParams('q=formação&type=video&from=2026-09-01&to=bad&album_id=4&favourite=1&place=Maputo&photo=12')
    expect(filtersFromSearchParams(sp)).toEqual({
      q: 'formação',
      type: 'video',
      from: '2026-09-01',
      album_id: 4,
      favourite: true,
      place: 'Maputo',
    })
    expect(filtersFromSearchParams(new URLSearchParams('type=gif&album_id=-1'))).toEqual({})
  })

  it('round-trips filters to URL params', () => {
    const f = { q: 'setembro 2026', type: 'image' as const, favourite: true, folder: '/Fotos' }
    expect(filtersFromSearchParams(searchParamsFromFilters(f))).toEqual(f)
    expect(hasActiveFilters({ q: 'x' })).toBe(false)
    expect(hasActiveFilters({ q: 'x', type: 'video' })).toBe(true)
  })

  it('turns meta.interpreted into chips', () => {
    expect(interpretedChips({ text: 'formação', type: 'video', from: '2026-09-01', to: '2026-09-30', favourite: true })).toEqual([
      { kind: 'text', value: 'formação' },
      { kind: 'type', value: 'video' },
      { kind: 'range', from: '2026-09-01', to: '2026-09-30' },
      { kind: 'favourite' },
    ])
    expect(interpretedChips(null)).toEqual([])
  })

  it('builds search URLs', () => {
    expect(searchUrl('  vídeos  ')).toBe('/search?q=v%C3%ADdeos')
  })
})
