import { api, cleanParams, getData } from './api'
import type { CursorPage, Media, SearchFilters, SearchSuggestions } from '@/types'

export const searchService = {
  search: async (filters: SearchFilters, cursor?: string | null): Promise<CursorPage<Media>> => {
    const res = await api.get<CursorPage<Media>>('/api/search', {
      params: cleanParams({ ...filters, cursor }),
    })
    return res.data
  },
  suggestions: (q: string, signal?: AbortSignal) =>
    getData<SearchSuggestions>('/api/search/suggestions', { params: { q }, signal }),
}
