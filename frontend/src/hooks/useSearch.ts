import { useQuery } from '@tanstack/react-query'
import { searchService } from '@/services/search'
import { qk } from '@/lib/queryKeys'
import type { SearchFilters } from '@/types'
import { useInfiniteMedia } from './useInfiniteMedia'
import { useDebouncedValue } from './useDebouncedValue'

export function useSearch(filters: SearchFilters) {
  const hasQuery = Boolean(filters.q || filters.type || filters.from || filters.to || filters.folder ||
    filters.album_id || filters.favourite || filters.place || filters.library_id)
  return useInfiniteMedia(qk.search(filters), (cursor) => searchService.search(filters, cursor), hasQuery)
}

export function useSearchSuggestions(q: string) {
  const debounced = useDebouncedValue(q.trim(), 250)
  return useQuery({
    queryKey: qk.suggestions(debounced),
    queryFn: ({ signal }) => searchService.suggestions(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  })
}
