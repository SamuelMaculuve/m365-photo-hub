import { useQuery } from '@tanstack/react-query'
import { librariesService, placesService } from '@/services/places'
import { qk } from '@/lib/queryKeys'

export function usePlaces() {
  return useQuery({ queryKey: qk.places, queryFn: placesService.list, staleTime: 5 * 60_000 })
}

export function useLibraries() {
  return useQuery({ queryKey: qk.libraries, queryFn: librariesService.list, staleTime: 5 * 60_000 })
}
