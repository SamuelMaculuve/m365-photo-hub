import { api, cleanParams, getData } from './api'
import type {
  BulkAction,
  CursorPage,
  Media,
  MediaDetail,
  PhotoFilters,
  TimelineBucket,
} from '@/types'

export interface ListParams extends PhotoFilters {
  cursor?: string | null
  limit?: number
}

export const photosService = {
  list: async (params: ListParams): Promise<CursorPage<Media>> => {
    const res = await api.get<CursorPage<Media>>('/api/photos', { params: cleanParams(params) })
    return res.data
  },
  buckets: (filters: PhotoFilters) =>
    getData<TimelineBucket[]>('/api/timeline/buckets', { params: cleanParams(filters) }),
  get: (id: number) => getData<MediaDetail>(`/api/photos/${id}`),
  favourite: async (id: number, value: boolean): Promise<boolean> => {
    const res = value
      ? await api.post<{ data: { is_favourite: boolean } }>(`/api/photos/${id}/favorite`)
      : await api.delete<{ data: { is_favourite: boolean } }>(`/api/photos/${id}/favorite`)
    return res.data?.data?.is_favourite ?? value
  },
  trash: async (id: number) => {
    await api.delete(`/api/photos/${id}`)
  },
  restore: async (id: number) => {
    await api.post(`/api/photos/${id}/restore`)
  },
  deleteFromSource: async (id: number) => {
    await api.post(`/api/photos/${id}/delete-from-source`, { confirm: 'DELETE' })
  },
  bulk: async (action: BulkAction, ids: number[]) => {
    // A API aceita no máximo 500 ids por pedido.
    for (let i = 0; i < ids.length; i += 500) {
      await api.post('/api/photos/bulk', { action, ids: ids.slice(i, i + 500) })
    }
  },
  trashList: async (cursor?: string | null): Promise<CursorPage<Media>> => {
    const res = await api.get<CursorPage<Media>>('/api/trash', { params: cleanParams({ cursor }) })
    return res.data
  },
  downloadUrl: (id: number) => `/api/photos/${id}/download`,
}
