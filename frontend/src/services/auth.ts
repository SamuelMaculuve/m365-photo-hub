import { api, getData } from './api'
import type { AuthConfig, CurrentUser } from '@/types'

export const MICROSOFT_LOGIN_URL = '/auth/microsoft/redirect'

export const authService = {
  config: () => getData<AuthConfig>('/api/auth/config', { skipAuthRedirect: true }),
  me: () => getData<CurrentUser>('/api/users/me', { skipAuthRedirect: true }),
  updateMe: async (input: { locale: 'pt' | 'en' }) => {
    const res = await api.patch<{ data: CurrentUser }>('/api/users/me', input)
    return res.data.data
  },
  devLogin: async (email: string) => {
    await api.post('/auth/dev-login', { email }, { skipAuthRedirect: true })
  },
  logout: async (): Promise<string | null> => {
    const res = await api.post<{ data?: { logout_url?: string | null } }>('/auth/logout', null, {
      skipAuthRedirect: true,
    })
    return res.data?.data?.logout_url ?? null
  },
  searchUsers: (q: string) =>
    getData<{ id: number; name: string; email: string }[]>('/api/users/search', { params: { q } }),
}
