import { api, cleanParams, getData } from './api'
import type { CursorPage, Media, PeopleFilters, Person, PersonInput } from '@/types'

export const peopleService = {
  list: (filters: PeopleFilters = {}) =>
    getData<Person[]>('/api/people', { params: cleanParams(filters) }),
  get: (id: number) => getData<Person>(`/api/people/${id}`),
  media: async (id: number, cursor?: string | null): Promise<CursorPage<Media>> => {
    const res = await api.get<CursorPage<Media>>(`/api/people/${id}/media`, {
      params: cleanParams({ cursor }),
    })
    return res.data
  },
  update: async (id: number, input: PersonInput) =>
    (await api.patch<{ data: Person }>(`/api/people/${id}`, input)).data.data,
  merge: async (id: number, intoId: number) =>
    (await api.post<{ data: Person }>(`/api/people/${id}/merge`, { into_id: intoId })).data.data,
  /** Excluir do reconhecimento (opt-out): apaga os rostos e impede novos agrupamentos. */
  suppress: async (id: number) => {
    await api.delete(`/api/people/${id}`)
  },
  /** «Não é esta pessoa»: remove um rosto do agrupamento. */
  removeFace: async (faceId: number) => {
    await api.delete(`/api/faces/${faceId}`)
  },
  thumbnailUrl: (id: number) => `/api/people/${id}/thumbnail`,
}
