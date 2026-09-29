import { getData } from './api'
import type { Library, Place } from '@/types'

export const placesService = {
  list: () => getData<Place[]>('/api/places'),
}

export const librariesService = {
  list: () => getData<Library[]>('/api/libraries'),
}
