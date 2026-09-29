import type { MediaType, SearchFilters, SearchInterpretation } from '@/types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Lê filtros de pesquisa a partir do URL (?q=&type=&from=…). */
export function filtersFromSearchParams(sp: URLSearchParams): SearchFilters {
  const f: SearchFilters = {}
  const q = sp.get('q')?.trim()
  if (q) f.q = q
  const type = sp.get('type')
  if (type === 'image' || type === 'video') f.type = type as MediaType
  const from = sp.get('from')
  if (from && DATE_RE.test(from)) f.from = from
  const to = sp.get('to')
  if (to && DATE_RE.test(to)) f.to = to
  const folder = sp.get('folder')?.trim()
  if (folder) f.folder = folder
  const album = Number(sp.get('album_id'))
  if (Number.isInteger(album) && album > 0) f.album_id = album
  const lib = Number(sp.get('library_id'))
  if (Number.isInteger(lib) && lib > 0) f.library_id = lib
  if (sp.get('favourite') === '1') f.favourite = true
  if (sp.get('semantic') === '1') f.semantic = true
  const place = sp.get('place')?.trim()
  if (place) f.place = place
  return f
}

/** Inverso de filtersFromSearchParams (omite valores vazios). */
export function searchParamsFromFilters(f: SearchFilters): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.q) sp.set('q', f.q)
  if (f.type) sp.set('type', f.type)
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  if (f.folder) sp.set('folder', f.folder)
  if (f.album_id) sp.set('album_id', String(f.album_id))
  if (f.library_id) sp.set('library_id', String(f.library_id))
  if (f.favourite) sp.set('favourite', '1')
  if (f.semantic) sp.set('semantic', '1')
  if (f.place) sp.set('place', f.place)
  return sp
}

export function hasActiveFilters(f: SearchFilters): boolean {
  return Boolean(f.type || f.from || f.to || f.folder || f.album_id || f.library_id || f.favourite || f.place)
}

export type InterpretedChip =
  | { kind: 'text'; value: string }
  | { kind: 'type'; value: MediaType }
  | { kind: 'range'; from: string | null; to: string | null }
  | { kind: 'favourite' }

/** Converte meta.interpreted em chips apresentáveis. */
export function interpretedChips(i: SearchInterpretation | null | undefined): InterpretedChip[] {
  if (!i) return []
  const chips: InterpretedChip[] = []
  if (i.text) chips.push({ kind: 'text', value: i.text })
  if (i.type === 'image' || i.type === 'video') chips.push({ kind: 'type', value: i.type })
  if (i.from || i.to) chips.push({ kind: 'range', from: i.from ?? null, to: i.to ?? null })
  if (i.favourite) chips.push({ kind: 'favourite' })
  return chips
}

/** URL da página de pesquisa para um termo. */
export function searchUrl(q: string): string {
  const sp = new URLSearchParams()
  if (q.trim()) sp.set('q', q.trim())
  return `/search?${sp.toString()}`
}
