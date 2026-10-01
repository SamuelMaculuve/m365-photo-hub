import { z } from 'zod'
import { boolish, intish, parse, queryObject } from '../lib/validate'
import type { MediaFilters } from '../services/timeline'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const schema = z.object({
  cursor: z.string().max(200).optional(),
  limit: intish.min(1).max(200).optional(),
  type: z.enum(['image', 'video']).optional(),
  library_id: intish.optional(),
  from: date.optional(),
  to: date.optional(),
  favourite: boolish.optional(),
  place: z.string().max(120).optional(),
  folder: z.string().max(1024).optional(),
  album_id: intish.optional(),
  q: z.string().max(200).optional(),
  semantic: boolish.optional(),
}).refine((d) => !d.from || !d.to || d.to >= d.from, { path: ['to'], message: 'O fim tem de ser igual ou posterior ao início.' })

/** Filtros da timeline/pesquisa a partir da query string (valores vazios são ignorados). */
export function mediaFilterRequest(url: string) {
  const raw = Object.fromEntries(Object.entries(queryObject(url)).filter(([, v]) => v !== '' && v !== '0' && v !== 'false'))
  const data = parse(schema, raw)
  const filters: MediaFilters = {}
  for (const k of ['type', 'library_id', 'from', 'to', 'favourite', 'place', 'folder', 'album_id'] as const) {
    if (data[k] !== undefined && data[k] !== false) (filters as Record<string, unknown>)[k] = data[k]
  }
  return { filters, cursor: data.cursor ?? null, limit: data.limit ?? 100, q: data.q ?? '', semantic: data.semantic ?? false }
}
