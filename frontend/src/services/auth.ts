import { api, getData } from './api'
import type { AuthConfig, CurrentUser } from '@/types'

export const MICROSOFT_LOGIN_URL = '/auth/microsoft/redirect'
/** Liga outra conta Microsoft (ex.: de outra organização) ao perfil actual. */
export const MICROSOFT_LINK_URL = '/auth/microsoft/link'

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
  unlinkIdentity: async (id: number) =>
    (await api.delete<{ data: CurrentUser }>(`/api/users/me/identities/${id}`)).data.data,
  searchUsers: (q: string) =>
    getData<{ id: number; name: string; email: string }[]>('/api/users/search', { params: { q } }),
}
