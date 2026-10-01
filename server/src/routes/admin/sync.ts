import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Db } from '../../db/client'
import * as s from '../../db/schema'
import { audit } from '../../lib/audit'
import { type AppEnv, requireRole } from '../../lib/context'
import { iso } from '../../lib/dates'
import { notFound } from '../../lib/errors'
import { translate } from '../../lib/i18n'
import { intish, parse, queryObject } from '../../lib/validate'
import { SyncManager } from '../../services/sync/manager'
import { kickSync } from '../../services/sync/trigger'

function progress(j: s.SyncJob): number | null {
  if (!j.totalEstimate) return j.status === 'completed' ? 100 : null
  return Math.round(Math.min(100, (j.processed / j.totalEstimate) * 100) * 10) / 10
}

function eta(j: s.SyncJob): number | null {
  if (j.status !== 'running' || !j.startedAt || !j.totalEstimate || j.processed === 0) return null
  const elapsed = Math.max(1, (Date.now() - j.startedAt.getTime()) / 1000)
  return Math.round((Math.max(0, j.totalEstimate - j.processed) * elapsed) / j.processed)
}

export async function syncJobResources(db: Db, jobs: s.SyncJob[]) {
  const ids = [...new Set(jobs.map((j) => j.driveId))]
  const drives = new Map(ids.length ? (await db.select({ id: s.drives.id, name: s.drives.name }).from(s.drives).where(inArray(s.drives.id, ids))).map((d) => [d.id, d]) : [])
  return jobs.map((j) => ({
    id: j.id,
    drive: drives.get(j.driveId) ?? null,
    library_id: j.libraryId,
    type: j.type,
    status: j.status,
    processed: j.processed,
    total_estimate: j.totalEstimate,
    created: j.created,
    updated: j.updated,
    removed: j.removed,
    errors: j.errors,
    progress: progress(j),
    eta_seconds: eta(j),
    started_at: iso(j.startedAt),
    finished_at: iso(j.finishedAt),
    created_at: iso(j.createdAt),
  }))
}

export const adminSyncRoutes = new Hono<AppEnv>()
  .get('/sync/status', async (c) => {
    requireRole(c, 'photo_admin')
    const db = c.get('db')
    const running = await db.select().from(s.syncJobs).where(inArray(s.syncJobs.status, ['queued', 'running'])).orderBy(desc(s.syncJobs.id))
    const drives = await db.selectDistinct({ drive: s.drives, state: s.driveSyncStates }).from(s.drives)
      .innerJoin(s.libraryRoots, eq(s.libraryRoots.driveId, s.drives.id))
      .leftJoin(s.driveSyncStates, eq(s.driveSyncStates.driveId, s.drives.id))
      .orderBy(asc(s.drives.id))
    return c.json({ data: {
      running: await syncJobResources(db, running),
      drives: drives.map(({ drive, state }) => ({
        id: drive.id,
        name: drive.name,
        status: state?.status ?? 'never',
        last_completed_at: iso(state?.lastCompletedAt),
        last_error: state?.lastError ? translate(c.get('locale'), 'errors.sync_error') : null,
        items_seen: state?.itemsSeen ?? 0,
      })),
    } })
  })
  .post('/sync', async (c) => {
    const user = requireRole(c, 'photo_admin')
    const db = c.get('db')
    const data = parse(z.object({ library_id: z.number().int().nullish(), full: z.boolean().optional() }), await c.req.json().catch(() => ({})))
    const libs = await db.select({ id: s.libraries.id }).from(s.libraries).where(and(
      isNull(s.libraries.deletedAt),
      data.library_id ? eq(s.libraries.id, data.library_id) : eq(s.libraries.enabled, true),
    ))
    if (data.library_id && !libs.length) throw notFound()
    const manager = new SyncManager(db)
    const jobs = new Map<number, s.SyncJob>()
    for (const l of libs) for (const j of await manager.startForLibrary(l.id, data.full ?? false, user.id)) jobs.set(j.id, j)
    await audit(db, { action: 'sync.start', userId: user.id, context: { library_id: data.library_id ?? null, full: data.full ?? false, jobs: [...jobs.keys()] }, ip: c.get('ip') })
    await kickSync()
    return c.json({ data: await syncJobResources(db, [...jobs.values()]) }, 202)
  })
  .get('/sync/jobs', async (c) => {
    requireRole(c, 'photo_admin')
    const db = c.get('db')
    const page = Math.max(1, parse(z.object({ page: intish.optional() }), queryObject(c.req.url)).page ?? 1)
    const perPage = 25
    const [{ total }] = await db.select({ total: count() }).from(s.syncJobs)
    const rows = await db.select().from(s.syncJobs).orderBy(desc(s.syncJobs.id)).limit(perPage).offset((page - 1) * perPage)
    return c.json({ data: await syncJobResources(db, rows), meta: { current_page: page, per_page: perPage, total, last_page: Math.max(1, Math.ceil(total / perPage)) } })
  })
  .get('/sync/jobs/:id/logs', async (c) => {
    requireRole(c, 'photo_admin')
    const db = c.get('db')
    const id = Number(c.req.param('id'))
    const [job] = Number.isInteger(id) ? await db.select({ id: s.syncJobs.id }).from(s.syncJobs).where(eq(s.syncJobs.id, id)) : []
    if (!job) throw notFound()
    const logs = await db.select({ id: s.syncLogs.id, level: s.syncLogs.level, code: s.syncLogs.code, message: s.syncLogs.message, item_id: s.syncLogs.itemId, created_at: s.syncLogs.createdAt })
      .from(s.syncLogs).where(eq(s.syncLogs.syncJobId, id)).orderBy(desc(s.syncLogs.id)).limit(500)
    return c.json({ data: logs.map((l) => ({ ...l, created_at: iso(l.created_at) })) })
  })

