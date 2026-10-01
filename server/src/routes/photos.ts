import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import { type AppContext, type AppEnv, requireUser } from '../lib/context'
import { iso } from '../lib/dates'
import { notFound } from '../lib/errors'
import { parse } from '../lib/validate'
import { Access } from '../services/access'
import { MediaContent } from '../services/content'
import { MediaService } from '../services/media'
import { mediaDetailResource, mediaResource, SIZES } from '../services/media-resource'
import { Timeline, type Page } from '../services/timeline'
import { mediaFilterRequest } from './filters'

export const cursorResponse = (c: AppContext, page: Page, limit: number) =>
  c.json({ data: page.items.map((m) => mediaResource(m)), meta: { next_cursor: page.nextCursor, per_page: limit } })

/** URLs temporários do Microsoft 365 não devem ficar em caches intermédias. */
const redirectNoStore = (c: AppContext, url: string) => {
  c.header('Cache-Control', 'no-store')
  c.header('Referrer-Policy', 'no-referrer')
  return c.redirect(url, 302)
}

function services(c: AppContext) {
  const db = c.get('db')
  const access = new Access(db)
  return { db, access, timeline: new Timeline(db, access), media: new MediaService(db, access, c.get('ip')) }
}

export const photoRoutes = new Hono<AppEnv>()
  .get('/timeline/buckets', async (c) => {
    const user = requireUser(c)
    return c.json({ data: await services(c).timeline.buckets(user, mediaFilterRequest(c.req.url).filters) })
  })
  .get('/photos', async (c) => {
    const user = requireUser(c)
    const { timeline } = services(c)
    const { filters, cursor, limit } = mediaFilterRequest(c.req.url)
    return cursorResponse(c, await timeline.paginate(user, await timeline.conditions(user, filters), limit, cursor), limit)
  })
  .get('/trash', async (c) => {
    const user = requireUser(c)
    const { timeline, media } = services(c)
    const { cursor, limit } = mediaFilterRequest(c.req.url)
    return cursorResponse(c, await timeline.paginate(user, await media.trashConditions(user), limit, cursor), limit)
  })
  .post('/photos/bulk', async (c) => {
    const user = requireUser(c)
    const data = parse(z.object({
      action: z.enum(['favorite', 'unfavorite', 'trash', 'restore']),
      ids: z.array(z.number().int()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, 'Os ids não podem repetir-se.'),
    }), await c.req.json().catch(() => ({})))
    return c.json({ data: { affected: await services(c).media.bulk(user, data.action, data.ids) } })
  })
  .get('/photos/:id{[0-9]+}', async (c) => {
    const user = requireUser(c)
    const { db, access, timeline, media } = services(c)
    const m = await media.findVisible(user, c.req.param('id'))
    const [withFav] = await timeline.withFavourites([m], user)
    await audit(db, { action: 'media.view', userId: user.id, subject: { type: 'media', id: m.id }, ip: c.get('ip') })
    return c.json({ data: await mediaDetailResource(db, access, withFav, user) })
  })
  .get('/photos/:id{[0-9]+}/thumbnail/:size', async (c) => {
    const user = requireUser(c)
    const size = c.req.param('size')
    if (!(SIZES as readonly string[]).includes(size)) throw notFound()
    const { db, media } = services(c)
    const m = await media.findVisible(user, c.req.param('id'))
    const thumb = await new MediaContent(db).thumbnail(m, size, user)
    return c.body(thumb.data, 200, {
      'Content-Type': thumb.mime,
      'Cache-Control': 'private, max-age=86400',
      ETag: `"${m.id}-${size}-${m.etag ?? ''}"`.replace(/[^\x20-\x7e]/g, ''),
    })
  })
  .get('/photos/:id{[0-9]+}/stream', async (c) => {
    const user = requireUser(c)
    const { db, media } = services(c)
    return redirectNoStore(c, await new MediaContent(db).downloadUrl(await media.findVisible(user, c.req.param('id')), user))
  })
  .get('/photos/:id{[0-9]+}/download', async (c) => {
    const user = requireUser(c)
    const { db, media } = services(c)
    const m = await media.findVisible(user, c.req.param('id'))
    const url = await new MediaContent(db).downloadUrl(m, user)
    await audit(db, { action: 'media.download', userId: user.id, subject: { type: 'media', id: m.id }, ip: c.get('ip') })
    return redirectNoStore(c, url)
  })
  .post('/photos/:id{[0-9]+}/favorite', async (c) => {
    const user = requireUser(c)
    const { media } = services(c)
    await media.setFavourite(user, [(await media.findVisible(user, c.req.param('id'))).id], true)
    return c.json({ data: { is_favourite: true } })
  })
  .delete('/photos/:id{[0-9]+}/favorite', async (c) => {
    const user = requireUser(c)
    const { media } = services(c)
    await media.setFavourite(user, [(await media.findVisible(user, c.req.param('id'))).id], false)
    return c.json({ data: { is_favourite: false } })
  })
  .delete('/photos/:id{[0-9]+}', async (c) => {
    const user = requireUser(c)
    const { media } = services(c)
    const updated = await media.trash(user, await media.findVisible(user, c.req.param('id')))
    return c.json({ data: { hidden_at: iso(updated.hiddenAt) } })
  })
  .post('/photos/:id{[0-9]+}/restore', async (c) => {
    const user = requireUser(c)
    const { media } = services(c)
    await media.restore(user, await media.findVisible(user, c.req.param('id')))
    return c.json({ data: { hidden_at: null } })
  })
  .post('/photos/:id{[0-9]+}/delete-from-source', async (c) => {
    const user = requireUser(c)
    parse(z.object({ confirm: z.literal('DELETE') }), await c.req.json().catch(() => ({})))
    const { media } = services(c)
    await media.deleteFromSource(user, await media.findVisible(user, c.req.param('id')))
    return c.json({ data: { deleted: true } })
  })
  .get('/libraries', async (c) => {
    const user = requireUser(c)
    const { db, access } = services(c)
    const ids = await access.libraryIds(user)
    if (!ids.length) return c.json({ data: [] })
    const libs = await db.select().from(s.libraries).where(inArray(s.libraries.id, ids)).orderBy(asc(s.libraries.name))
    const counts = new Map((await db.select({ id: s.media.libraryId, n: count() }).from(s.media)
      .where(and(inArray(s.media.libraryId, ids), eq(s.media.sourceState, 'active'), isNull(s.media.hiddenAt))).groupBy(s.media.libraryId)).map((r) => [r.id, r.n]))
    return c.json({ data: libs.map((l) => ({ id: l.id, name: l.name, description: l.description, media_count: counts.get(l.id) ?? 0, allow_writes: l.allowWrites })) })
  })
