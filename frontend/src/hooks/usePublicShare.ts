import { useQuery } from '@tanstack/react-query'
import { sharesService } from '@/services/shares'
import { qk } from '@/lib/queryKeys'

export function usePublicShare(token: string, password: string | null) {
  return useQuery({
    queryKey: [...qk.publicShare(token), password ?? ''],
    queryFn: () => sharesService.getPublic(token, password),
    staleTime: 5 * 60_000,
  })
}
