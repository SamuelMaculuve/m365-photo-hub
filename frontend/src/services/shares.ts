import axios from 'axios'
import { api, getData, normaliseError } from './api'
import type { PublicShare, Share, ShareInput } from '@/types'

export const sharesService = {
  mine: () => getData<Share[]>('/api/shares'),
  sharedWithMe: () => getData<Share[]>('/api/shared-with-me'),
  create: async (input: ShareInput) => {
    const res = await api.post<{ data: Share }>('/api/shares', input)
    return res.data.data
  },
  /** Conteúdo de uma partilha recebida (autenticado). */
  items: (id: number) => getData<PublicShare>(`/api/shares/${id}/items`),
  revoke: async (id: number) => {
    await api.delete(`/api/shares/${id}`)
  },
  /** Página pública: nunca redirecciona para /login. */
  getPublic: async (token: string, password?: string | null): Promise<PublicShare> => {
    try {
      const res = await api.get<{ data: PublicShare }>(
        `/api/public/shares/${encodeURIComponent(token)}`,
        {
          skipAuthRedirect: true,
          headers: password ? { 'X-Share-Password': password } : undefined,
        },
      )
      return res.data.data
    } catch (err) {
      throw axios.isAxiosError(err) ? normaliseError(err) : err
    }
  },
}

/** URL absoluto para copiar. */
export function absoluteUrl(url: string): string {
  try {
    return new URL(url, window.location.origin).toString()
  } catch {
    return url
  }
}
