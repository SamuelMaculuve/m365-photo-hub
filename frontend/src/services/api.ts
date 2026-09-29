import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios'

/** Códigos de erro conhecidos (docs/API.md → Erros). */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'share_expired'
  | 'validation_error'
  | 'share_password_required'
  | 'too_many_requests'
  | 'media_unavailable'
  | 'graph_unavailable'
  | 'graph_throttled'
  | 'network_error'
  | 'server_error'
  | 'unknown'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | string
  readonly errors: Record<string, string[]>
  readonly retryAfter: number | null

  constructor(opts: {
    status: number
    code: ApiErrorCode | string
    message: string
    errors?: Record<string, string[]>
    retryAfter?: number | null
  }) {
    super(opts.message)
    this.name = 'ApiError'
    this.status = opts.status
    this.code = opts.code
    this.errors = opts.errors ?? {}
    this.retryAfter = opts.retryAfter ?? null
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }

  /** Primeira mensagem de validação de um campo. */
  fieldError(field: string): string | undefined {
    return this.errors[field]?.[0]
  }
}

const STATUS_CODES: Record<number, ApiErrorCode> = {
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  410: 'share_expired',
  419: 'unauthenticated',
  422: 'validation_error',
  423: 'share_password_required',
  429: 'too_many_requests',
  502: 'media_unavailable',
  503: 'graph_unavailable',
}

interface ErrorBody {
  error?: { code?: string; message?: string; errors?: Record<string, string[]> }
  message?: string
  errors?: Record<string, string[]>
}

function parseRetryAfter(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  if (Number.isFinite(n) && n >= 0) return n
  const date = Date.parse(String(value))
  if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1000))
  return null
}

/** Converte qualquer erro (axios, rede, outro) num ApiError tipado. */
export function normaliseError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError<ErrorBody>
    if (!e.response) {
      return new ApiError({ status: 0, code: 'network_error', message: e.message || 'Network Error' })
    }
    const { status, data, headers } = e.response
    const body: ErrorBody = data && typeof data === 'object' ? data : {}
    const code =
      body.error?.code ?? STATUS_CODES[status] ?? (status >= 500 ? 'server_error' : 'unknown')
    const message = body.error?.message ?? body.message ?? e.message ?? 'Error'
    const errors = body.error?.errors ?? body.errors ?? {}
    const retryAfter = parseRetryAfter(
      (headers as Record<string, unknown> | undefined)?.['retry-after'],
    )
    return new ApiError({ status, code, message, errors, retryAfter })
  }
  if (err instanceof Error) return new ApiError({ status: 0, code: 'unknown', message: err.message })
  return new ApiError({ status: 0, code: 'unknown', message: String(err) })
}

export const api = axios.create({
  baseURL: '',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
})

const MUTATING = new Set(['post', 'put', 'patch', 'delete'])
let csrfPromise: Promise<void> | null = null

/** Obtém o cookie XSRF-TOKEN uma única vez (repetido só se falhar). */
export function ensureCsrfCookie(): Promise<void> {
  if (!csrfPromise) {
    csrfPromise = axios
      .get('/sanctum/csrf-cookie', { withCredentials: true })
      .then(() => undefined)
      .catch((err: unknown) => {
        csrfPromise = null
        throw normaliseError(err)
      })
  }
  return csrfPromise
}

/** Só para testes. */
export function resetCsrfState(): void {
  csrfPromise = null
}

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Não redireccionar para /login num 401 (ex.: páginas públicas, guarda de rota). */
    skipAuthRedirect?: boolean
  }
}

type UnauthenticatedHandler = () => void

let onUnauthenticated: UnauthenticatedHandler = () => {
  const path = window.location.pathname
  if (path.startsWith('/login') || path.startsWith('/s/')) return
  window.location.assign('/login?error=session_expired')
}

export function setUnauthenticatedHandler(fn: UnauthenticatedHandler): void {
  onUnauthenticated = fn
}

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.method && MUTATING.has(config.method.toLowerCase())) {
    await ensureCsrfCookie()
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    const apiErr = normaliseError(err)
    const cfg = axios.isAxiosError(err) ? (err.config as AxiosRequestConfig | undefined) : undefined
    if (apiErr.status === 419) {
      // Token CSRF expirado: força novo pedido do cookie na próxima mutação.
      csrfPromise = null
    }
    if (apiErr.status === 401 && !cfg?.skipAuthRedirect) {
      onUnauthenticated()
    }
    return Promise.reject(apiErr)
  },
)

/** Extrai `data` de `{ data: T }`. */
export async function getData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<{ data: T }>(url, config)
  return res.data.data
}

/** Remove parâmetros vazios e converte booleanos para 1/0. */
export function cleanParams(params: object): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    out[k] = typeof v === 'boolean' ? 1 : (v as string | number)
  }
  return out
}
