import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { CursorPage, Media, MediaDetail } from '@/types'
import { qk, MEDIA_LIST_PREFIXES } from '@/lib/queryKeys'

type Pages = InfiniteData<CursorPage<Media>>

function isPages(v: unknown): v is Pages {
  return !!v && typeof v === 'object' && Array.isArray((v as Pages).pages)
}

/** Aplica um patch a um conjunto de media em todas as listas em cache (actualização optimista). */
export function patchMediaInCaches(qc: QueryClient, ids: number[], patch: Partial<Media>): void {
  const set = new Set(ids)
  for (const prefix of MEDIA_LIST_PREFIXES) {
    qc.setQueriesData<unknown>({ queryKey: [prefix] }, (old: unknown) => {
      if (!isPages(old)) return old
      return {
        ...old,
        pages: old.pages.map((p) => ({
          ...p,
          data: p.data.map((m) => (set.has(m.id) ? { ...m, ...patch } : m)),
        })),
      }
    })
  }
  for (const id of ids) {
    qc.setQueryData<MediaDetail>(qk.photo(id), (old) => (old ? ({ ...old, ...patch } as MediaDetail) : old))
  }
}

/** Remove media de todas as listas em cache (ex.: enviado para o lixo). */
export function removeMediaFromCaches(qc: QueryClient, ids: number[], prefixes: readonly string[] = ['photos', 'search', 'album-media', 'person-media']): void {
  const set = new Set(ids)
  for (const prefix of prefixes) {
    qc.setQueriesData<unknown>({ queryKey: [prefix] }, (old: unknown) => {
      if (!isPages(old)) return old
      return {
        ...old,
        pages: old.pages.map((p) => ({ ...p, data: p.data.filter((m) => !set.has(m.id)) })),
      }
    })
  }
}

export function invalidateMediaLists(qc: QueryClient): Promise<void> {
  return Promise.all(
    MEDIA_LIST_PREFIXES.map((p) => qc.invalidateQueries({ queryKey: [p] })),
  ).then(() => undefined)
}
