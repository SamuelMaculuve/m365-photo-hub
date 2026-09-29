import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { sharesService } from '@/services/shares'
import { authService } from '@/services/auth'
import { qk } from '@/lib/queryKeys'
import { useDebouncedValue } from './useDebouncedValue'

export function useMyShares() {
  return useQuery({ queryKey: qk.shares, queryFn: sharesService.mine })
}

export function useSharedWithMe() {
  return useQuery({ queryKey: qk.sharedWithMe, queryFn: sharesService.sharedWithMe })
}

export function useCreateShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sharesService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shares }),
  })
}

export function useRevokeShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: sharesService.revoke,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.shares }),
  })
}

export function useUserSearch(q: string) {
  const debounced = useDebouncedValue(q.trim(), 250)
  return useQuery({
    queryKey: qk.users(debounced),
    queryFn: () => authService.searchUsers(debounced),
    enabled: debounced.length >= 2,
  })
}
