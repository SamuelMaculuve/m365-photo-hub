import { api, cleanParams, getData } from './api'
import type { Album, AlbumInput, CursorPage, Media, Paginated } from '@/types'

export const albumsService = {
  list: async (params: { page?: number; q?: string } = {}): Promise<Paginated<Album>> => {
    const res = await api.get<Paginated<Album>>('/api/albums', { params: cleanParams(params) })
    return res.data
  },
  get: (id: number) => getData<Album>(`/api/albums/${id}`),
  create: async (input: AlbumInput & { name: string }) => {
    const res = await api.post<{ data: Album }>('/api/albums', input)
    return res.data.data
  },
  update: async (id: number, input: AlbumInput) => {
    const res = await api.put<{ data: Album }>(`/api/albums/${id}`, input)
    return res.data.data
  },
  remove: async (id: number) => {
    await api.delete(`/api/albums/${id}`)
  },
  media: async (id: number, cursor?: string | null): Promise<CursorPage<Media>> => {
    const res = await api.get<CursorPage<Media>>(`/api/albums/${id}/media`, {
      params: cleanParams({ cursor }),
    })
    return res.data
  },
  addMedia: async (id: number, mediaIds: number[]) => {
    await api.post(`/api/albums/${id}/media`, { media_ids: mediaIds })
  },
  removeMedia: async (id: number, mediaIds: number[]) => {
    await api.delete(`/api/albums/${id}/media`, { data: { media_ids: mediaIds } })
  },
}
