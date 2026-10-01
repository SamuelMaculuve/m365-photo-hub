import { and, asc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { escapeLike, iLike } from '../lib/sql'
import { Hono } from 'hono'
import { z } from 'zod'
import { libraries, users } from '../db/schema'
import { type AppEnv, hasRole, requireUser, type User } from '../lib/context'
import { parse, queryObject } from '../lib/validate'
import type { Db } from '../db/client'
import { Access } from '../services/access'
import { atLeast } from '../lib/roles'

export async function meResource(db: Db, user: User) {
  const roles = await new Access(db).libraryRoles(user)
  const ids = [...roles.keys()]
  const libs = ids.length
    ? await db.select({ id: libraries.id, name: libraries.name, allowWrites: libraries.allowWrites }).from(libraries).where(inArray(libraries.id, ids)).orderBy(asc(libraries.name))
    : []
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    locale: user.locale,
    role: user.role,
    permissions: {
      admin: hasRole(user, 'photo_admin'),
      manage_libraries: hasRole(user, 'super_admin'),
      manage_sync: hasRole(user, 'photo_admin'),
      manage_users: hasRole(user, 'super_admin'),
      view_audit: hasRole(user, 'super_admin'),
      delete_from_source: hasRole(user, 'photo_admin'),
      upload: libs.some((l) => l.allowWrites && atLeast(roles.get(l.id)!, 'contributor')),
    },
    // Rostos e IA dependem de Python/serviços externos e não existem no backend do Netlify.
    features: { semantic_search: false, faces: false },
    libraries: libs.map((l) => ({ id: l.id, name: l.name, role: roles.get(l.id)!, allow_writes: l.allowWrites })),
  }
}

export const meRoutes = new Hono<AppEnv>()
  .get('/users/me', async (c) => c.json({ data: await meResource(c.get('db'), requireUser(c)) }))
  .patch('/users/me', async (c) => {
    const user = requireUser(c)
    const data = parse(z.object({ locale: z.enum(['pt', 'en']) }), await c.req.json().catch(() => ({})))
    const [updated] = await c.get('db').update(users).set({ locale: data.locale, updatedAt: new Date() }).where(eq(users.id, user.id)).returning()
    c.set('locale', data.locale)
    return c.json({ data: await meResource(c.get('db'), updated) })
  })
  /** Pesquisa de utilizadores da aplicação para partilha (nome/email mínimos). */
  .get('/users/search', async (c) => {
    const user = requireUser(c)
    const { q } = parse(z.object({ q: z.string().min(2).max(100) }), queryObject(c.req.url))
    const pattern = `%${escapeLike(q)}%`
    const rows = await c.get('db').select({ id: users.id, name: users.name, email: users.email }).from(users)
      .where(and(eq(users.isActive, true), isNull(users.deletedAt), ne(users.id, user.id), or(iLike(users.name, pattern), iLike(users.email, pattern))))
      .orderBy(asc(users.name)).limit(10)
    return c.json({ data: rows })
  })
