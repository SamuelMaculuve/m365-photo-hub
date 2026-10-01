import { vi } from 'vitest'
import { createApp } from '../src/app'
import { getDb } from '../src/db/client'
import * as s from '../src/db/schema'
import { randomToken, sha256 } from '../src/lib/crypto'
import { withFolded } from '../src/services/folded'

// ---------------------------------------------------------------------------
// Simulador de fetch (Microsoft Graph e login.microsoftonline.com)
// ---------------------------------------------------------------------------

export interface FakeRequest {
  method: string
  url: string
  headers: Headers
  body: string
  form: URLSearchParams
  json: any
}
type Handler = (req: FakeRequest) => Response | Promise<Response> | unknown
const routes: { pattern: string | RegExp; handler: Handler }[] = []
export const sent: FakeRequest[] = []
const realFetch = globalThis.fetch

/** Regista uma resposta para URLs que contenham `pattern` (string) ou correspondam à RegExp. */
export function fake(pattern: string | RegExp, handler: Handler): void {
  routes.unshift({ pattern, handler })
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export function resetFetch(): void {
  routes.length = 0
  sent.length = 0
  // Token de aplicação sempre disponível nos testes.
  fake('/oauth2/v2.0/token', () => json({ access_token: 'app-token', expires_in: 3600 }))
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const body = init?.body ? String(init.body) : ''
    const req: FakeRequest = {
      method: (init?.method ?? 'GET').toUpperCase(),
      url,
      headers: new Headers(init?.headers),
      body,
      form: new URLSearchParams(body),
      json: (() => { try { return JSON.parse(body) } catch { return null } })(),
    }
    sent.push(req)
    const route = routes.find((r) => (typeof r.pattern === 'string' ? url.includes(r.pattern) : r.pattern.test(url)))
    if (!route) throw new Error(`Stray request: ${req.method} ${url}`)
    const res = await route.handler(req)
    return res instanceof Response ? res : json(res)
  }) as typeof fetch
}

export const restoreRealFetch = () => { globalThis.fetch = realFetch }

// ---------------------------------------------------------------------------
// Cliente HTTP de teste com cookies (sessão + XSRF)
// ---------------------------------------------------------------------------

export class Client {
  private readonly app = createApp()
  readonly cookies = new Map<string, string>()

  async request(method: string, path: string, opts: { json?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
    const headers = new Headers(opts.headers)
    headers.set('accept', 'application/json')
    if (!['GET', 'HEAD'].includes(method) && !this.cookies.has('XSRF-TOKEN')) await this.request('GET', '/sanctum/csrf-cookie')
    if (!['GET', 'HEAD'].includes(method) && !headers.has('x-xsrf-token')) headers.set('x-xsrf-token', this.cookies.get('XSRF-TOKEN') ?? '')
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    if (opts.json !== undefined) headers.set('content-type', 'application/json')
    const res = await this.app.request(`http://localhost${path}`, { method, headers, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined })
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const [k, ...v] = pair.split('=')
      const value = v.join('=')
      if (attrs.some((a) => /max-age=0/i.test(a)) || value === '') this.cookies.delete(k.trim())
      else this.cookies.set(k.trim(), value)
    }
    return res
  }

  get = (path: string, headers?: Record<string, string>) => this.request('GET', path, { headers })
  post = (path: string, json?: unknown) => this.request('POST', path, { json: json ?? {} })
  put = (path: string, json?: unknown) => this.request('PUT', path, { json: json ?? {} })
  patch = (path: string, json?: unknown) => this.request('PATCH', path, { json: json ?? {} })
  delete = (path: string, json?: unknown) => this.request('DELETE', path, { json })

  /** Sessão autenticada directamente na base (equivalente a actingAs). */
  async actingAs(user: s.User): Promise<this> {
    const token = randomToken(32)
    const db = await getDb()
    await db.insert(s.sessions).values({ id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) })
    this.cookies.set('m365_session', token)
    return this
  }
}

// ---------------------------------------------------------------------------
// Fábricas
// ---------------------------------------------------------------------------

let seq = 0
const n = () => ++seq

export async function makeUser(attrs: Partial<typeof s.users.$inferInsert> = {}) {
  const db = await getDb()
  const i = n()
  const [u] = await db.insert(s.users).values({
    entraOid: crypto.randomUUID(), tenantId: 'tenant-test', name: `Utilizador ${i}`, email: `u${i}@org.mz`, role: 'viewer', groupIds: [], ...attrs,
  }).returning()
  return u
}

export async function makeLibrary(attrs: Partial<typeof s.libraries.$inferInsert> = {}, rootItemId = 'root-folder') {
  const db = await getDb()
  const i = n()
  const [library] = await db.insert(s.libraries).values({ name: `Biblioteca ${i}`, slug: `biblioteca-${i}`, visibility: 'restricted', ...attrs }).returning()
  const [drive] = await db.insert(s.drives).values({ driveId: `b!drive-${i}`, driveType: 'documentLibrary', name: 'Documentos', authMode: 'app' }).returning()
  await db.insert(s.libraryRoots).values({ libraryId: library.id, driveId: drive.id, rootItemId, rootPath: '/Fotos' })
  return { library, drive }
}

export async function makeMedia(library: { id: number }, drive: { id: number }, attrs: Partial<typeof s.media.$inferInsert> = {}) {
  const db = await getDb()
  const i = n()
  const taken = attrs.takenAt ?? new Date(Date.UTC(2026, 8, 1, 10) - i * 3600_000)
  const [m] = await db.insert(s.media).values(withFolded({
    libraryId: library.id, driveId: drive.id, itemId: `01ITEM${i}`, parentItemId: 'folder-1', name: `IMG_${i}.jpg`, folderPath: '/Fotos/2026',
    mediaType: 'image', mimeType: 'image/jpeg', size: 2_000_000, width: 4000, height: 3000, takenAt: taken, sourceCreatedAt: taken,
    sourceModifiedAt: taken, sortAt: taken, etag: `etag-${i}`, ctag: `ctag-${i}`, webUrl: 'https://contoso.sharepoint.com/file.jpg',
    sourceState: 'active', metadataExtracted: true, ...attrs,
  })).returning()
  return m
}

export async function grant(library: { id: number }, user: s.User, role = 'viewer') {
  const db = await getDb()
  await db.insert(s.libraryAccess).values({ libraryId: library.id, principalType: 'user', principalId: user.entraOid ?? `local:${user.id}`, role })
}
