import { and, eq, gt, isNull } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { config } from '../config'
import { sessions, users } from '../db/schema'
import type { AppContext, AppEnv } from './context'
import { randomToken, safeEqual, sha256 } from './crypto'
import { AppError } from './errors'

const secure = () => !config.isLocal

/** Carrega a sessão a partir do cookie (HttpOnly, SameSite=Lax). A expiração é deslizante. */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  c.set('user', null)
  c.set('sessionId', null)
  const raw = getCookie(c, config.session.cookie)
  if (raw) {
    const db = c.get('db')
    const id = sha256(raw)
    const [row] = await db.select({ session: sessions, user: users }).from(sessions)
      .leftJoin(users, and(eq(users.id, sessions.userId), isNull(users.deletedAt)))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    if (row) {
      c.set('sessionId', id)
      c.set('user', row.user)
      // Renova no máximo uma vez por minuto para não escrever em cada pedido.
      if (Date.now() - row.session.lastActivityAt.getTime() > 60_000) {
        await db.update(sessions).set({ lastActivityAt: new Date(), expiresAt: expiry() }).where(eq(sessions.id, id))
      }
    }
  }
  await next()
}

const expiry = () => new Date(Date.now() + config.session.lifetimeMinutes * 60_000)

/** Inicia sessão com um id novo (evita fixação de sessão). */
export async function startSession(c: AppContext, userId: number): Promise<void> {
  const db = c.get('db')
  const old = c.get('sessionId')
  if (old) await db.delete(sessions).where(eq(sessions.id, old))
  const token = randomToken(32)
  const id = sha256(token)
  await db.insert(sessions).values({
    id, userId, ip: c.get('ip'), userAgent: c.req.header('user-agent')?.slice(0, 500) ?? null, expiresAt: expiry(),
  })
  setCookie(c, config.session.cookie, token, {
    httpOnly: true, secure: secure(), sameSite: 'Lax', path: '/', maxAge: config.session.lifetimeMinutes * 60,
  })
  c.set('sessionId', id)
  issueCsrfCookie(c)
}

export async function endSession(c: AppContext): Promise<void> {
  const id = c.get('sessionId')
  if (id) await c.get('db').delete(sessions).where(eq(sessions.id, id))
  deleteCookie(c, config.session.cookie, { path: '/' })
  c.set('sessionId', null)
  c.set('user', null)
  issueCsrfCookie(c)
}

/** Cookie XSRF-TOKEN legível pelo SPA (o axios envia-o no cabeçalho X-XSRF-TOKEN). */
export function issueCsrfCookie(c: AppContext): void {
  setCookie(c, 'XSRF-TOKEN', randomToken(32), { httpOnly: false, secure: secure(), sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 12 })
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Double-submit: o cabeçalho X-XSRF-TOKEN tem de igualar o cookie XSRF-TOKEN (419 caso contrário). */
export const csrfMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE.has(c.req.method)) {
    const cookie = getCookie(c, 'XSRF-TOKEN') ?? ''
    const header = c.req.header('x-xsrf-token') ?? ''
    if (!cookie || !header || !safeEqual(cookie, decodeURIComponent(header))) {
      throw new AppError('unauthenticated', 419, 'CSRF token mismatch')
    }
  }
  await next()
}
