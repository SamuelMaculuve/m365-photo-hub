import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authService } from '@/services/auth'
import { qk } from '@/lib/queryKeys'
import { setLocale } from '@/i18n'
import type { CurrentUser } from '@/types'

export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: authService.me,
    staleTime: 5 * 60_000,
  })
}

/** Utilizador actual (só dentro das rotas protegidas, onde já está carregado). */
export function useCurrentUser(): CurrentUser | undefined {
  return useMe().data
}

export function useAuthConfig() {
  return useQuery({ queryKey: qk.authConfig, queryFn: authService.config, staleTime: Infinity })
}

export function useLogout() {
  return useMutation({
    mutationFn: authService.logout,
    onSettled: (logoutUrl) => {
      window.location.assign(logoutUrl || '/login')
    },
  })
}

export function useUpdateLocale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (locale: 'pt' | 'en') => {
      await setLocale(locale)
      return authService.updateMe({ locale })
    },
    onSuccess: (user) => {
      if (user) qc.setQueryData(qk.me, user)
    },
  })
}

export function useDevLogin() {
  return useMutation({
    mutationFn: authService.devLogin,
    onSuccess: () => window.location.assign('/'),
  })
}
