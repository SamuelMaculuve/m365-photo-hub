import { and, count, desc, eq, gt, gte, ilike, inArray, isNull, like, lt, lte, max, or, sum, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import * as s from '../../db/schema'
import { audit } from '../../lib/audit'
import { type AppEnv, requireRole } from '../../lib/context'
import { iso } from '../../lib/dates'
import { notFound, validationError } from '../../lib/errors'
import { translate } from '../../lib/i18n'
import { ROLES } from '../../lib/roles'
import { intish, parse, queryObject } from '../../lib/validate'
import { allSettings, updateSettings } from '../../services/settings'
import { escapeLike } from '../../services/timeline'

export const adminMiscRoutes = new Hono<AppEnv>()
  .get('/dashboard', async (c) => {
    requireRole(c, 'photo_admin')
    const db = c.get('db')
    const active = and(eq(s.media.sourceState, 'active'), isNull(s.media.hiddenAt))
    const [photos] = await db.select({ n: count() }).from(s.media).where(and(active, eq(s.media.mediaType, 'image')))
    const [videos] = await db.select({ n: count() }).from(s.media).where(and(active, eq(s.media.mediaType, 'video')))
    const [storage] = await db.select({ n: sum(s.media.size) }).from(s.media).where(active)
    const [albums] = await db.select({ n: count() }).from(s.albums).where(isNull(s.albums.deletedAt))
    const [users] = await db.select({ n: count() }).from(s.users).where(eq(s.users.isActive, true))
    const [last] = await db.select({ v: max(s.driveSyncStates.lastCompletedAt) }).from(s.driveSyncStates)
    const [errors] = await db.select({ n: count() }).from(s.syncLogs).where(and(eq(s.syncLogs.level, 'error'), gt(s.syncLogs.createdAt, new Date(Date.now() - 86_400_000))))
    const [failed] = await db.select({ n: count() }).from(s.driveSyncStates).where(eq(s.driveSyncStates.status, 'failed'))
    const [running] = await db.select({ n: count() }).from(s.syncJobs).where(inArray(s.syncJobs.status, ['queued', 'running']))
    return c.json({ data: {
      photos: photos.n,
      videos: videos.n,
      albums: albums.n,
      users: users.n,
      storage_bytes: Number(storage.n ?? 0),
      last_sync_at: iso(last.v ? new Date(last.v) : null),
      sync_errors_24h: errors.n,
      // A extracção de EXIF a partir do ficheiro não existe no backend do Netlify.
      unprocessed: 0,
      running_jobs: running.n,
      status: failed.n > 0 ? 'error' : errors.n > 0 ? 'degraded' : 'healthy',
      ai_enabled: false,
      ai: null,
    } })
  })
  .get('/errors', async (c) => {
    requireRole(c, 'photo_admin')
    const rows = await c.get('db').select({ id: s.syncLogs.id, sync_job_id: s.syncLogs.syncJobId, level: s.syncLogs.level, code: s.syncLogs.code, message: s.syncLogs.message, item_id: s.syncLogs.itemId, created_at: s.syncLogs.createdAt })
      .from(s.syncLogs).where(inArray(s.syncLogs.level, ['error', 'warning'])).orderBy(desc(s.syncLogs.id)).limit(200)
    return c.json({ data: rows.map((r) => ({ ...r, created_at: iso(r.created_at) })) })
  })
  .get('/faces/status', (c) => {
    requireRole(c, 'photo_admin')
    // O reconhecimento facial (Python/ONNX) não corre em Netlify Functions.
    return c.json({ data: { enabled: false, available: false, scanned: 0, pending: 0, faces: 0, people: 0 } })
  })
  .get('/audit-logs', async (c) => {
    requireRole(c, 'super_admin')
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    const q = parse(z.object({
      cursor: intish.optional(), action: z.string().max(64).optional(), user_id: intish.optional(),
      from: date.optional(), to: date.optional(), limit: intish.min(1).max(200).optional(),
    }), Object.fromEntries(Object.entries(queryObject(c.req.url)).filter(([, v]) => v !== '')))
    const limit = q.limit ?? 50
    const conds: SQL[] = []
    if (q.cursor) conds.push(lt(s.auditLogs.id, q.cursor))
    if (q.action) conds.push(like(s.auditLogs.action, `${escapeLike(q.action)}%`))
    if (q.user_id) conds.push(eq(s.auditLogs.userId, q.user_id))
    if (q.from) conds.push(gte(s.auditLogs.createdAt, new Date(`${q.from}T00:00:00Z`)))
    if (q.to) conds.push(lte(s.auditLogs.createdAt, new Date(`${q.to}T23:59:59Z`)))
    const db = c.get('db')
    const rows = await db.select({ log: s.auditLogs, user: { id: s.users.id, name: s.users.name } }).from(s.auditLogs)
      .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId)).where(and(...conds)).orderBy(desc(s.auditLogs.id)).limit(limit + 1)
    const page = rows.slice(0, limit)
    return c.json({
      data: page.map(({ log, user }) => ({
        id: log.id, user: user?.id ? user : null, action: log.action, subject_type: log.subjectType, subject_id: log.subjectId,
        ip: log.ip, result: log.result, context: log.context, created_at: iso(log.createdAt),
      })),
      meta: { next_cursor: rows.length > limit ? String(page.at(-1)!.log.id) : null, per_page: limit },
    })
  })
  .get('/users', async (c) => {
    requireRole(c, 'super_admin')
    const db = c.get('db')
    const { q, page: p } = parse(z.object({ q: z.string().max(100).optional(), page: intish.min(1).optional() }), queryObject(c.req.url))
    const page = p ?? 1
    const perPage = 50
    const pattern = q ? `%${escapeLike(q)}%` : null
    const where = and(isNull(s.users.deletedAt), pattern ? or(ilike(s.users.name, pattern), ilike(s.users.email, pattern)) : undefined)
    const [{ total }] = await db.select({ total: count() }).from(s.users).where(where)
    const rows = await db.select().from(s.users).where(where).orderBy(s.users.name).limit(perPage).offset((page - 1) * perPage)
    return c.json({
      data: rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, role_source: u.roleSource, is_active: u.isActive, last_login_at: iso(u.lastLoginAt) })),
      meta: { current_page: page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) },
    })
  })
  .put('/users/:id{[0-9]+}', async (c) => {
    const me = requireRole(c, 'super_admin')
    const db = c.get('db')
    const [user] = await db.select().from(s.users).where(and(eq(s.users.id, Number(c.req.param('id'))), isNull(s.users.deletedAt)))
    if (!user) throw notFound()
    const data = parse(z.object({ role: z.enum(ROLES).optional(), role_source: z.enum(['entra', 'local']).optional(), is_active: z.boolean().optional() }), await c.req.json().catch(() => ({})))
    if (user.id === me.id && (data.role !== undefined || data.is_active === false)) throw validationError('role', translate(c.get('locale'), 'admin.cannot_change_self'))
    // Alterar o papel manualmente fixa-o localmente (deixa de seguir as App Roles do Entra).
    const values: Partial<s.User> = { updatedAt: new Date() }
    if (data.role !== undefined) { values.role = data.role; values.roleSource = data.role_source ?? 'local' }
    else if (data.role_source !== undefined) values.roleSource = data.role_source
    if (data.is_active !== undefined) values.isActive = data.is_active
    const [updated] = await db.update(s.users).set(values).where(eq(s.users.id, user.id)).returning()
    await audit(db, { action: 'user.update', userId: me.id, subject: { type: 'user', id: user.id }, context: data, ip: c.get('ip') })
    return c.json({ data: { id: updated.id, role: updated.role, role_source: updated.roleSource, is_active: updated.isActive } })
  })
  .get('/settings', async (c) => {
    requireRole(c, 'super_admin')
    return c.json({ data: await allSettings(c.get('db')) })
  })
  .put('/settings', async (c) => {
    const user = requireRole(c, 'super_admin')
    const db = c.get('db')
    const data = parse(z.object({
      public_links_enabled: z.boolean().optional(), max_share_days: z.number().int().min(1).max(365).optional(),
      ai_enabled: z.boolean().optional(), faces_enabled: z.boolean().optional(), gps_precision: z.enum(['exact', 'city', 'hidden']).optional(),
    }), await c.req.json().catch(() => ({})))
    const result = await updateSettings(db, data, user.id)
    await audit(db, { action: 'settings.update', userId: user.id, context: data, ip: c.get('ip') })
    return c.json({ data: result })
  })
