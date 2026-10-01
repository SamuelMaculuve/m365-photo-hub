import { api, getData } from './api'
import type { CatalogPlace, Library, Place, SetLocationInput } from '@/types'

export const placesService = {
  list: () => getData<Place[]>('/api/places'),
  catalog: () => getData<CatalogPlace[]>('/api/places/catalog'),
  /** Define (ou remove) o local de várias fotografias; o GPS real nunca é substituído. */
  setLocation: async (input: SetLocationInput): Promise<{ affected: number; place: string | null }> => {
    let affected = 0
    let place: string | null = null
    for (let i = 0; i < input.ids.length; i += 1000) {
      const res = await api.post<{ data: { affected: number; place: string | null } }>('/api/photos/location', { ...input, ids: input.ids.slice(i, i + 1000) })
      affected += res.data.data.affected
      place = res.data.data.place
    }
    return { affected, place }
  },
}

export const librariesService = {
  list: () => getData<Library[]>('/api/libraries'),
}
