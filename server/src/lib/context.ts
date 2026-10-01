import type { Context } from 'hono'
import type { Db } from '../db/client'
import type { users } from '../db/schema'
import { forbidden, unauthenticated } from './errors'
import type { Locale } from './i18n'
import { atLeast, type Role } from './roles'

export type User = typeof users.$inferSelect

export type AppEnv = {
  Variables: {
    db: Db
    user: User | null
    sessionId: string | null
    locale: Locale
    ip: string | null
  }
}

export type AppContext = Context<AppEnv>

export function requireUser(c: AppContext): User {
  const user = c.get('user')
  if (!user) throw unauthenticated()
  if (!user.isActive) throw forbidden('User disabled')
  return user
}

export function requireRole(c: AppContext, role: Role): User {
  const user = requireUser(c)
  if (!atLeast(user.role as Role, role)) throw forbidden(`Requires role ${role}`)
  return user
}

export const hasRole = (user: User, role: Role) => atLeast(user.role as Role, role)

/** IP do cliente atrás do proxy do Netlify. */
export function clientIp(c: Context): string | null {
  const h = c.req.header('x-nf-client-connection-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]
  return h?.trim() || null
}
