import { useMemo } from 'react'
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query'
import type { CursorPage, Media } from '@/types'

/** useInfiniteQuery genérico sobre listas por cursor (meta.next_cursor). */
export function useInfiniteMedia(
  queryKey: QueryKey,
  fetchPage: (cursor: string | null) => Promise<CursorPage<Media>>,
  enabled = true,
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta?.next_cursor ?? null,
    enabled,
  })
  const items = useMemo(() => {
    const out: Media[] = []
    const seen = new Set<number>()
    for (const page of query.data?.pages ?? []) {
      for (const m of page.data) {
        if (!seen.has(m.id)) {
          seen.add(m.id)
          out.push(m)
        }
      }
    }
    return out
  }, [query.data])
  const meta = query.data?.pages[0]?.meta
  return { ...query, items, meta }
}

export type InfiniteMediaResult = ReturnType<typeof useInfiniteMedia>
