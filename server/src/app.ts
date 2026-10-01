import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { config } from './config'
import { getDb } from './db/client'
import { clientIp, type AppEnv } from './lib/context'
import { AppError, ValidationError } from './lib/errors'
import { pickLocale, translate, type Locale } from './lib/i18n'
import { requestContext } from './lib/request-context'
import { csrfMiddleware, endSession, sessionMiddleware } from './lib/session'
import { authRoutes } from './routes/auth'
import { meRoutes } from './routes/me'
import { photoRoutes } from './routes/photos'
import { searchRoutes } from './routes/search'
import { albumRoutes } from './routes/albums'
import { shareRoutes } from './routes/shares'
import { locationRoutes } from './routes/location'
import { adminGraphRoutes } from './routes/admin/graph'
import { adminLibraryRoutes } from './routes/admin/libraries'
import { adminSyncRoutes } from './routes/admin/sync'
import { adminMiscRoutes } from './routes/admin/misc'

/** API completa (rotas /api, /auth e /sanctum), servida por uma Netlify Function ou pelo servidor de desenvolvimento. */
export function createApp() {
  const app = new Hono<AppEnv>()

  // Antes do middleware da base: responde mesmo que a base esteja em baixo e diz porquê
  // (só o tipo de erro conhecido — nunca mensagens internas, hosts ou credenciais).
  app.get('/api/health', async (c) => {
    try {
      const db = await getDb()
      await db.execute(sql`select 1`)
      return c.json({ status: 'ok', database: 'ok', app_key: Boolean(config.appKey) })
    } catch (e) {
      console.error('health: database unavailable', e)
      const reason = String((e as Error)?.message ?? '').includes('Netlify Database não está disponível') ? 'not_created' : ((e as Error)?.name ?? 'error')
      return c.json({ status: 'error', database: 'unavailable', reason, app_key: Boolean(config.appKey) }, 503)
    }
  })

  app.use('*', async (c, next) => {
    c.set('db', await getDb())
    c.set('ip', clientIp(c))
    c.set('locale', pickLocale(c.req.header('accept-language')))
    await next()
    securityHeaders(c.req.path, c.res.headers, c.req.url.startsWith('https://'))
  })
  app.use('*', sessionMiddleware)
  app.use('*', async (c, next) => {
    const user = c.get('user')
    if (user && (user.locale === 'pt' || user.locale === 'en')) c.set('locale', user.locale as Locale)
    await requestContext.run({ locale: c.get('locale') }, next)
  })
  app.use('*', csrfMiddleware)

  app.route('/', authRoutes)
  app.route('/api', meRoutes)
  app.route('/api', photoRoutes)
  app.route('/api', searchRoutes)
  app.route('/api', albumRoutes)
  app.route('/api', shareRoutes)
  app.route('/api', locationRoutes)
  app.route('/api/admin', adminLibraryRoutes)
  app.route('/api/admin', adminGraphRoutes)
  app.route('/api/admin', adminSyncRoutes)
  app.route('/api/admin', adminMiscRoutes)

  app.notFound((c) => c.json({ error: { code: 'not_found', message: translate(c.get('locale') ?? 'pt', 'errors.not_found') } }, 404))

  app.onError(async (err, c) => {
    const locale = c.get('locale') ?? 'pt'
    if (err instanceof AppError) {
      // Token delegado revogado: terminar a sessão para forçar novo login com a Microsoft.
      if (err.status === 401 && c.get('sessionId')) await endSession(c).catch(() => undefined)
      if (err.status >= 500) console.error(err)
      const key = err.messageKey ?? `errors.${err.code}`
      let message = translate(locale, key)
      if (message === key) message = translate(locale, 'errors.internal_error')
      const body: Record<string, unknown> = { code: err.code, message }
      if (err instanceof ValidationError) body.errors = err.errors
      return c.json({ error: body }, err.status as 400, err.headers)
    }
    console.error(err)
    const body: Record<string, unknown> = { code: 'internal_error', message: translate(locale, 'errors.internal_error') }
    if (config.debug) body.debug = { message: String((err as Error)?.message ?? err) }
    return c.json({ error: body }, 500)
  })

  return app
}

function securityHeaders(path: string, headers: Headers, secure: boolean) {
  const values: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
  // Respostas da API nunca são documentos HTML: CSP restritiva.
  if (path.startsWith('/api/')) values['Content-Security-Policy'] = "default-src 'none'; frame-ancestors 'none'"
  if (secure) values['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  for (const [k, v] of Object.entries(values)) if (!headers.has(k)) headers.set(k, v)
}
