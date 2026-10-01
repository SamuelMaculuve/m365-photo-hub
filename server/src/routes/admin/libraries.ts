import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db/client'
import * as s from '../../db/schema'
import { type AppEnv, requireRole } from '../../lib/context'
import { iso } from '../../lib/dates'
import { notFound } from '../../lib/errors'
import { translate, type Locale } from '../../lib/i18n'
import { parse } from '../../lib/validate'
import { LibraryService, type LibraryInput } from '../../services/libraries'
import { validateLibrary } from '../../services/permissions'

const rootSchema = z.object({ drive_id: z.string().max(191), item_id: z.string().max(191).nullish(), site_id: z.string().max(191).nullish() })
const base = {
  description: z.string().max(2000).nullish(),
  enabled: z.boolean().optional(),
  allow_public_links: z.boolean().optional(),
  allow_writes: z.boolean().optional(),
  allow_ai: z.boolean().optional(),
  allow_faces: z.boolean().optional(),
  auth_mode: z.enum(['app', 'delegated']).optional(),
}
const createSchema = z.object({ ...base, name: z.string().min(1).max(150), visibility: z.enum(['organisation', 'restricted']), roots: z.array(rootSchema).min(1).max(20) })
const updateSchema = z.object({ ...base, name: z.string().min(1).max(150).optional(), visibility: z.enum(['organisation', 'restricted']).optional(), roots: z.array(rootSchema).min(1).max(20).optional() })
const accessSchema = z.object({
  entries: z.array(z.object({
    principal_type: z.enum(['user', 'group']),
    principal_id: z.string().min(1).max(64),
    display_name: z.string().max(190).nullish(),
    role: z.enum(['photo_admin', 'editor', 'contributor', 'viewer']),
  })).max(500),
})

export async function libraryAdminResources(db: Db, libs: s.Library[], locale: Locale = 'pt') {
  if (!libs.length) return []
  const ids = libs.map((l) => l.id)
  const roots = await db.select({ root: s.libraryRoots, drive: s.drives, state: s.driveSyncStates }).from(s.libraryRoots)
    .innerJoin(s.drives, eq(s.drives.id, s.libraryRoots.driveId))
    .leftJoin(s.driveSyncStates, eq(s.driveSyncStates.driveId, s.drives.id))
    .where(inArray(s.libraryRoots.libraryId, ids)).orderBy(asc(s.libraryRoots.id))
  const counts = new Map((await db.select({ id: s.media.libraryId, n: count() }).from(s.media)
    .where(and(inArray(s.media.libraryId, ids), eq(s.media.sourceState, 'active'))).groupBy(s.media.libraryId)).map((r) => [r.id, r.n]))
  return libs.map((l) => ({
    id: l.id,
    name: l.name,
    slug: l.slug,
    description: l.description,
    visibility: l.visibility,
    enabled: l.enabled,
    allow_public_links: l.allowPublicLinks,
    allow_writes: l.allowWrites,
    allow_ai: l.allowAi,
    allow_faces: l.allowFaces,
    media_count: counts.get(l.id) ?? 0,
    roots: roots.filter((r) => r.root.libraryId === l.id).map(({ root, drive, state }) => ({
      id: root.id,
      drive_id: drive.driveId,
      drive_name: drive.name,
      item_id: root.rootItemId,
      path: root.rootPath,
      auth_mode: drive.authMode,
      sync: { status: state?.status ?? 'never', last_completed_at: iso(state?.lastCompletedAt), last_error: state?.lastError ? translate(locale, 'errors.sync_error') : null },
    })),
    created_at: iso(l.createdAt),
  }))
}

async function findLibrary(db: Db, id: string): Promise<s.Library> {
  const [lib] = Number.isInteger(Number(id)) ? await db.select().from(s.libraries).where(and(eq(s.libraries.id, Number(id)), isNull(s.libraries.deletedAt))) : []
  if (!lib) throw notFound()
  return lib
}

const accessList = (db: Db, id: number) =>
  db.select({ principal_type: s.libraryAccess.principalType, principal_id: s.libraryAccess.principalId, display_name: s.libraryAccess.displayName, role: s.libraryAccess.role })
    .from(s.libraryAccess).where(eq(s.libraryAccess.libraryId, id)).orderBy(asc(s.libraryAccess.principalType))

export const adminLibraryRoutes = new Hono<AppEnv>()
  .get('/libraries', async (c) => {
    requireRole(c, 'photo_admin')
    const db = c.get('db')
    const libs = await db.select().from(s.libraries).where(isNull(s.libraries.deletedAt)).orderBy(asc(s.libraries.name))
    return c.json({ data: await libraryAdminResources(db, libs, c.get('locale')) })
  })
  .post('/libraries', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    const data = parse(createSchema, await c.req.json().catch(() => ({})))
    const lib = await new LibraryService(db, c.get('locale')).create(user, data as LibraryInput, c.get('ip'))
    return c.json({ data: (await libraryAdminResources(db, [lib], c.get('locale')))[0] }, 201)
  })
  .put('/libraries/:id', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    const lib = await findLibrary(db, c.req.param('id'))
    const data = parse(updateSchema, await c.req.json().catch(() => ({})))
    const updated = await new LibraryService(db, c.get('locale')).update(lib, user, data as LibraryInput, c.get('ip'))
    return c.json({ data: (await libraryAdminResources(db, [updated], c.get('locale')))[0] })
  })
  .delete('/libraries/:id', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    await new LibraryService(db).delete(await findLibrary(db, c.req.param('id')), user, c.get('ip'))
    return c.json({ data: { deleted: true } })
  })
  .post('/libraries/:id/validate', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    return c.json({ data: await validateLibrary(db, await findLibrary(db, c.req.param('id')), user, c.get('locale')) })
  })
  .get('/libraries/:id/access', async (c) => {
    requireRole(c, 'super_admin')
    const db = c.get('db')
    const lib = await findLibrary(db, c.req.param('id'))
    return c.json({ data: await accessList(db, lib.id) })
  })
  .put('/libraries/:id/access', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    const lib = await findLibrary(db, c.req.param('id'))
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
    // Aceita { entries: [...] } ou { access: [...] }.
    const { entries } = parse(accessSchema, { entries: body.entries ?? body.access })
    await new LibraryService(db).replaceAccess(lib, entries, user, c.get('ip'))
    return c.json({ data: await accessList(db, lib.id) })
  })
