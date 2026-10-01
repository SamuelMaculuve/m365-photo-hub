import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { placesService } from '@/services/places'
import type { SetLocationInput } from '@/types'

export function usePlaceCatalog(enabled = true) {
  return useQuery({
    queryKey: ['places', 'catalog'],
    queryFn: placesService.catalog,
    enabled,
    staleTime: 60 * 60 * 1000,
  })
}

export function useSetLocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetLocationInput) => placesService.setLocation(input),
    // Local afecta detalhe, locais, pesquisa e listas: refrescar tudo o que estiver em cache.
    onSuccess: () => qc.invalidateQueries(),
  })
}
