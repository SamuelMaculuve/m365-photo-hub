import { useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

const PARAM = 'photo'

/**
 * Estado do visualizador no URL (?photo=<id>): o botão "voltar" fecha-o.
 * Abrir faz push; navegar entre fotos faz replace; fechar volta atrás se fomos nós a abrir.
 */
export function useViewerParam() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const raw = params.get(PARAM)
  const photoId = raw && /^\d+$/.test(raw) ? Number(raw) : null

  const withPhoto = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(location.search)
      if (id == null) next.delete(PARAM)
      else next.set(PARAM, String(id))
      const qs = next.toString()
      return `${location.pathname}${qs ? `?${qs}` : ''}`
    },
    [location.pathname, location.search],
  )

  const open = useCallback(
    (id: number) => navigate(withPhoto(id), { state: { viewer: true } }),
    [navigate, withPhoto],
  )
  const go = useCallback(
    (id: number) => navigate(withPhoto(id), { replace: true, state: location.state }),
    [navigate, withPhoto, location.state],
  )
  const close = useCallback(() => {
    const state = location.state as { viewer?: boolean } | null
    if (state?.viewer) navigate(-1)
    else navigate(withPhoto(null), { replace: true })
  }, [navigate, withPhoto, location.state])

  return { photoId, open, go, close }
}
