import { config } from '../config'
import { GraphApiError, GraphThrottleError, unauthenticated } from '../lib/errors'
import type { GraphTokenProvider } from './auth'

export interface SendOptions {
  query?: Record<string, string | number>
  json?: unknown
  headers?: Record<string, string>
  /** false => devolve o 302 em vez de o seguir (URLs de download). */
  redirects?: boolean
  retries?: number
  timeoutMs?: number
  allowStatus?: number[]
  /** Espera máxima por um Retry-After; pedidos web usam valores curtos para não bloquear o utilizador. */
  maxWaitMs?: number
}

type Json = Record<string, any>

let sleepImpl = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
/** Só para testes. */
export const setSleep = (fn: (ms: number) => Promise<void>) => { sleepImpl = fn }

/**
 * Único ponto de contacto HTTP com o Microsoft Graph.
 * Trata: autenticação, paginação, throttling (429/503 + Retry-After), retries com backoff
 * exponencial e jitter, renovação de token após 401 e normalização de erros.
 */
export class GraphClient {
  private readonly baseUrl = config.microsoft.graphBaseUrl
  private readonly host = new URL(this.baseUrl).host

  async get(path: string, auth: GraphTokenProvider, query: Record<string, string | number> = {}, options: SendOptions = {}): Promise<Json> {
    return ((await (await this.send('GET', path, auth, { ...options, query })).json().catch(() => ({}))) ?? {}) as Json
  }

  /** Itera todos os elementos de uma colecção paginada (@odata.nextLink). */
  async *paginate(path: string, auth: GraphTokenProvider, query: Record<string, string | number> = {}, limit?: number): AsyncGenerator<Json> {
    let count = 0
    for await (const page of this.pages(path, auth, query)) {
      for (const item of (page.value ?? []) as Json[]) {
        yield item
        if (limit !== undefined && ++count >= limit) return
      }
    }
  }

  /** Páginas brutas, incluindo @odata.nextLink / @odata.deltaLink. */
  async *pages(pathOrUrl: string, auth: GraphTokenProvider, query: Record<string, string | number> = {}, options: SendOptions = {}): AsyncGenerator<Json> {
    let next: string | null = pathOrUrl
    let first = true
    while (next) {
      const page = await this.get(next, auth, first ? query : {}, options)
      first = false
      yield page
      next = (page['@odata.nextLink'] as string | undefined) ?? null
    }
  }

  async send(method: string, pathOrUrl: string, auth: GraphTokenProvider, options: SendOptions = {}): Promise<Response> {
    const url = this.resolveUrl(pathOrUrl, options.query)
    const maxRetries = options.retries ?? config.microsoft.maxRetries
    const maxWaitMs = options.maxWaitMs ?? 60_000
    let authRetried = false
    let attempt = 0

    while (true) {
      let res: Response
      try {
        res = await fetch(url, {
          method,
          redirect: options.redirects === false ? 'manual' : 'follow',
          headers: {
            Authorization: `Bearer ${await auth.token()}`,
            'User-Agent': config.microsoft.userAgent,
            Accept: 'application/json',
            ...(options.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
          },
          body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
          signal: AbortSignal.timeout(options.timeoutMs ?? config.microsoft.timeoutMs),
        })
      } catch (e) {
        if ((e as Error)?.name === 'AppError') throw e
        if (attempt++ < maxRetries) {
          await sleepImpl(backoffMs(attempt))
          continue
        }
        logFailure(method, url, null, 'connection', String(e))
        throw new GraphApiError('Graph connection failed', 0, 'connection')
      }

      const status = res.status
      if (res.ok || (status >= 300 && status < 400) || options.allowStatus?.includes(status)) return res

      if (status === 401 && !authRetried) {
        authRetried = true
        auth.invalidate()
        continue
      }

      if ([429, 503, 504].includes(status)) {
        const retryAfter = retryAfterSeconds(res)
        const wait = retryAfter !== null ? retryAfter * 1000 : backoffMs(attempt + 1)
        if (attempt++ < maxRetries && wait <= maxWaitMs) {
          await sleepImpl(wait)
          continue
        }
        logFailure(method, url, status, 'throttled', 'retries exhausted')
        throw new GraphThrottleError(retryAfter ?? 30)
      }

      if (status >= 500 && attempt++ < maxRetries) {
        await sleepImpl(backoffMs(attempt))
        continue
      }

      const body = (await res.json().catch(() => ({}))) as Json
      const code = (body?.error?.code as string | undefined) ?? null
      logFailure(method, url, status, code, body?.error?.message)

      // Token delegado revogado/expirado sem possibilidade de renovação: o utilizador tem de voltar a entrar.
      if (status === 401 && auth.identity().startsWith('user:')) throw unauthenticated('Delegated token rejected by Graph')

      throw new GraphApiError('Graph request failed', status, code)
    }
  }

  /** Aceita caminhos relativos ou URLs absolutos (nextLink/deltaLink) — mas só do host do Graph (evita SSRF). */
  private resolveUrl(pathOrUrl: string, query?: Record<string, string | number>): string {
    let url: URL
    if (pathOrUrl.startsWith('https://')) {
      url = new URL(pathOrUrl)
      if (url.host !== this.host) throw new GraphApiError('Refusing to call non-Graph host', 0, 'invalid_host')
    } else if (/^[a-z]+:\/\//i.test(pathOrUrl)) {
      throw new GraphApiError('Refusing to call non-Graph host', 0, 'invalid_host')
    } else {
      url = new URL(`${this.baseUrl}/${pathOrUrl.replace(/^\/+/, '')}`)
    }
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v))
    return url.toString()
  }
}

function retryAfterSeconds(res: Response): number | null {
  const v = res.headers.get('retry-after')
  return v !== null && /^\d+$/.test(v) ? Math.min(Number(v), 300) : null
}

function backoffMs(attempt: number): number {
  const delay = Math.min(60_000, 500 * 2 ** (attempt - 1))
  return Math.floor(delay / 2 + Math.random() * (delay / 2)) // "equal jitter"
}

function logFailure(method: string, url: string, status: number | null, code: string | null, message: unknown): void {
  // Sem tokens nem query string (pode conter tokens de delta).
  console.warn('Graph request failed', { method, path: new URL(url).pathname, status, code, message: String(message ?? '').slice(0, 300) })
}

export const enc = encodeURIComponent
export const itemPath = (driveId: string, itemId: string) => `/drives/${enc(driveId)}/items/${enc(itemId)}`
