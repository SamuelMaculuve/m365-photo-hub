import { and, desc, eq, ilike, inArray, lt, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import type { User } from '../lib/context'
import { Access } from './access'

export interface MediaFilters {
  type?: 'image' | 'video'
  library_id?: number
  from?: string
  to?: string
  month?: number
  place?: string
  folder?: string
  album_id?: number
  favourite?: boolean
}

export const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`)

/** Filtros da timeline (também usados pela pesquisa). */
export function filterConditions(user: User, f: MediaFilters): SQL[] {
  const c: SQL[] = []
  if (f.type) c.push(eq(s.media.mediaType, f.type))
  if (f.library_id) c.push(eq(s.media.libraryId, f.library_id))
  if (f.from) c.push(sql`${s.media.sortAt} >= ${`${f.from}T00:00:00Z`}::timestamptz`)
  if (f.to) c.push(sql`${s.media.sortAt} <= ${`${f.to}T23:59:59.999Z`}::timestamptz`)
  if (f.month) c.push(sql`extract(month from ${s.media.sortAt} at time zone 'UTC') = ${f.month}`)
  if (f.place) c.push(eq(s.media.placeName, f.place))
  if (f.folder) c.push(ilike(s.media.folderPath, `${escapeLike(f.folder.replace(/\/+$/, ''))}%`))
  if (f.album_id) {
    c.push(sql`exists (select 1 from ${s.albumMedia} where ${s.albumMedia.mediaId} = ${s.media.id} and ${s.albumMedia.albumId} = ${f.album_id})`)
  }
  if (f.favourite) {
    c.push(sql`exists (select 1 from ${s.userMedia} where ${s.userMedia.mediaId} = ${s.media.id} and ${s.userMedia.userId} = ${user.id} and ${s.userMedia.isFavourite} = true)`)
  }
  return c
}

export interface Page {
  items: (s.Media & { isFavourite: boolean })[]
  nextCursor: string | null
}

export function encodeCursor(m: { sortAt: Date; id: number }): string {
  return Buffer.from(JSON.stringify([m.sortAt.toISOString(), m.id])).toString('base64url')
}

export function decodeCursor(cursor: string | null | undefined): [Date, number] | null {
  if (!cursor) return null
  try {
    const data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (!Array.isArray(data) || data.length !== 2 || typeof data[0] !== 'string' || !Number.isInteger(data[1])) return null
    const d = new Date(data[0])
    return Number.isNaN(d.getTime()) ? null : [d, data[1]]
  } catch {
    return null
  }
}

/**
 * Consultas da timeline: filtros, paginação por cursor (keyset em sort_at DESC, id DESC)
 * e contagens por mês. Nunca carrega a biblioteca completa em memória.
 */
export class Timeline {
  constructor(private readonly db: Db, private readonly access = new Access(db)) {}

  async conditions(user: User, filters: MediaFilters, inTrash = false): Promise<SQL[]> {
    return [await this.access.visibleCondition(user, inTrash), ...filterConditions(user, filters)]
  }

  async paginate(user: User, where: SQL[], limit: number, cursor?: string | null, order: 'timeline' | SQL[] = 'timeline'): Promise<Page> {
    const pos = decodeCursor(cursor)
    const conds = [...where]
    if (pos) conds.push(or(lt(s.media.sortAt, pos[0]), and(eq(s.media.sortAt, pos[0]), lt(s.media.id, pos[1])))!)
    const rows = await this.db.select().from(s.media).where(and(...conds))
      .orderBy(...(order === 'timeline' ? [desc(s.media.sortAt), desc(s.media.id)] : order)).limit(limit + 1)
    const items = rows.slice(0, limit)
    const last = items.at(-1)
    return { items: await this.withFavourites(items, user), nextCursor: rows.length > limit && last ? encodeCursor(last) : null }
  }

  async withFavourites<T extends s.Media>(items: T[], user: User): Promise<(T & { isFavourite: boolean })[]> {
    if (!items.length) return []
    const favs = new Set((await this.db.select({ id: s.userMedia.mediaId }).from(s.userMedia)
      .where(and(eq(s.userMedia.userId, user.id), eq(s.userMedia.isFavourite, true), inArray(s.userMedia.mediaId, items.map((i) => i.id))))).map((r) => r.id))
    return items.map((m) => ({ ...m, isFavourite: favs.has(m.id) }))
  }

  async buckets(user: User, filters: MediaFilters): Promise<{ month: string; count: number }[]> {
    const month = sql<string>`to_char(${s.media.sortAt} at time zone 'UTC', 'YYYY-MM')`
    const rows = await this.db.select({ month, count: sql<number>`count(*)::int` }).from(s.media)
      .where(and(...(await this.conditions(user, filters)))).groupBy(month).orderBy(desc(month))
    return rows.map((r) => ({ month: r.month, count: Number(r.count) }))
  }
}

