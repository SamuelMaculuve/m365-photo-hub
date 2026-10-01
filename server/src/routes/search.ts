import { and, desc, inArray, isNotNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import * as s from '../db/schema'
import { type AppEnv, requireUser } from '../lib/context'
import { parse, queryObject } from '../lib/validate'
import { Access } from '../services/access'
import { mediaResource } from '../services/media-resource'
import { Search } from '../services/search'
import { getSetting } from '../services/settings'
import { Timeline } from '../services/timeline'
import { mediaFilterRequest } from './filters'

export const searchRoutes = new Hono<AppEnv>()
  .get('/search', async (c) => {
    const user = requireUser(c)
    const db = c.get('db')
    const timeline = new Timeline(db)
    const { filters, cursor, limit, q } = mediaFilterRequest(c.req.url)
    const built = await new Search(db, timeline).build(user, q, filters)
    const page = await timeline.paginate(user, built.where, limit, cursor)
    return c.json({ data: page.items.map((m) => mediaResource(m)), meta: { next_cursor: page.nextCursor, per_page: limit, interpreted: built.interpreted } })
  })
  .get('/search/suggestions', async (c) => {
    const user = requireUser(c)
    const { q } = parse(z.object({ q: z.string().min(1).max(100) }), queryObject(c.req.url))
    return c.json({ data: await new Search(c.get('db')).suggestions(user, q) })
  })
  .get('/places', async (c) => {
    const user = requireUser(c)
    const db = c.get('db')
    const precision = await getSetting<string>(db, 'gps_precision')
    if (precision === 'hidden') return c.json({ data: [] })
    // Só locais de media que o utilizador pode ver; coordenadas = centro das fotografias.
    const visible = await new Access(db).visibleCondition(user)
    const count = sql<number>`count(*)::int`
    const rows = await db.select({
      name: s.media.placeName, region: s.media.placeRegion, count, coverId: sql<number>`max(${s.media.id})`,
      lat: sql<number | null>`avg(${s.media.latitude})`, lng: sql<number | null>`avg(${s.media.longitude})`,
    }).from(s.media).where(and(visible, isNotNull(s.media.placeName)))
      .groupBy(s.media.placeName, s.media.placeRegion).orderBy(desc(count)).limit(200)
    const covers = new Map(rows.length ? (await db.select().from(s.media).where(inArray(s.media.id, rows.map((r) => Number(r.coverId))))).map((m) => [m.id, m]) : [])
    const round = (v: number | null) => (v === null ? null : Math.round(Number(v) * 1e5) / 1e5)
    return c.json({ data: rows.map((p) => ({
      name: p.name,
      admin1: p.region,
      count: Number(p.count),
      latitude: precision === 'exact' ? round(p.lat) : null,
      longitude: precision === 'exact' ? round(p.lng) : null,
      cover: covers.has(Number(p.coverId)) ? mediaResource(covers.get(Number(p.coverId))!) : null,
    })) })
  })
