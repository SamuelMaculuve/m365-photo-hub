import { and, count, desc, eq, ilike, inArray, isNull, max, min, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import { hasRole, type User } from '../lib/context'
import { iso } from '../lib/dates'
import { forbidden, notFound, validationError } from '../lib/errors'
import { Access } from './access'
import { mediaResource } from './media-resource'
import { escapeLike } from './timeline'

const PER_PAGE = 48

export const canViewAlbum = (u: User, a: s.Album) => a.ownerId === u.id || a.visibility === 'organisation' || hasRole(u, 'photo_admin')
export const canUpdateAlbum = (u: User, a: s.Album) => a.ownerId === u.id || hasRole(u, 'photo_admin')
/** Álbuns da organização aceitam contributos de editores; privados só do dono. */
export const canAddToAlbum = (u: User, a: s.Album) => canUpdateAlbum(u, a) || (a.visibility === 'organisation' && hasRole(u, 'editor'))

/** Álbuns guardam apenas referências a media — nunca cópias dos ficheiros. */
export class AlbumService {
  constructor(private readonly db: Db, private readonly access = new Access(db), private readonly ip: string | null = null) {}

  async find(id: string | number, user: User, check: 'view' | 'update' | 'add' = 'view'): Promise<s.Album> {
    const n = Number(id)
    const [album] = Number.isInteger(n) ? await this.db.select().from(s.albums).where(and(eq(s.albums.id, n), isNull(s.albums.deletedAt))) : []
    if (!album) throw notFound()
    const ok = check === 'view' ? canViewAlbum(user, album) : check === 'update' ? canUpdateAlbum(user, album) : canAddToAlbum(user, album)
    if (!ok) throw forbidden()
    return album
  }

  async list(user: User, q: string | null, page: number) {
    const where = and(
      isNull(s.albums.deletedAt),
      or(eq(s.albums.ownerId, user.id), eq(s.albums.visibility, 'organisation')),
      q ? ilike(s.albums.name, `%${escapeLike(q)}%`) : undefined,
    )
    const [{ total }] = await this.db.select({ total: count() }).from(s.albums).where(where)
    const rows = await this.db.select().from(s.albums).where(where).orderBy(desc(s.albums.updatedAt), desc(s.albums.id)).limit(PER_PAGE).offset((page - 1) * PER_PAGE)
    return { data: await this.resources(rows, user), meta: { current_page: page, per_page: PER_PAGE, total, last_page: Math.max(1, Math.ceil(total / PER_PAGE)) } }
  }

  async create(user: User, data: { name: string; description?: string | null; visibility?: string }) {
    const [album] = await this.db.insert(s.albums).values({ ownerId: user.id, name: data.name, description: data.description ?? null, visibility: data.visibility ?? 'private' }).returning()
    await audit(this.db, { action: 'album.create', userId: user.id, subject: { type: 'album', id: album.id }, context: { name: album.name }, ip: this.ip })
    return album
  }

  async update(album: s.Album, user: User, data: { name?: string; description?: string | null; visibility?: string; cover_media_id?: number | null }) {
    if (data.cover_media_id != null) {
      const [hit] = await this.db.select().from(s.albumMedia).where(and(eq(s.albumMedia.albumId, album.id), eq(s.albumMedia.mediaId, data.cover_media_id)))
      if (!hit) throw validationError('cover_media_id', 'not_found')
    }
    const values: Partial<s.Album> = { updatedAt: new Date() }
    if (data.name !== undefined) values.name = data.name
    if (data.description !== undefined) values.description = data.description
    if (data.visibility !== undefined) values.visibility = data.visibility
    if (data.cover_media_id !== undefined) values.coverMediaId = data.cover_media_id
    const [updated] = await this.db.update(s.albums).set(values).where(eq(s.albums.id, album.id)).returning()
    await audit(this.db, { action: 'album.update', userId: user.id, subject: { type: 'album', id: album.id }, context: { fields: Object.keys(data) }, ip: this.ip })
    return updated
  }

  async delete(album: s.Album, user: User) {
    await this.db.update(s.albums).set({ deletedAt: new Date() }).where(eq(s.albums.id, album.id))
    await audit(this.db, { action: 'album.delete', userId: user.id, subject: { type: 'album', id: album.id }, ip: this.ip })
  }

  /** Só adiciona media que o utilizador pode ver. */
  async addMedia(album: s.Album, user: User, ids: number[]): Promise<number> {
    const visible = (await this.db.select({ id: s.media.id }).from(s.media).where(and(await this.access.visibleCondition(user), inArray(s.media.id, ids)))).map((r) => r.id)
    if (!visible.length) return 0
    const existing = new Set((await this.db.select({ id: s.albumMedia.mediaId }).from(s.albumMedia).where(and(eq(s.albumMedia.albumId, album.id), inArray(s.albumMedia.mediaId, visible)))).map((r) => r.id))
    const [{ pos }] = await this.db.select({ pos: max(s.albumMedia.position) }).from(s.albumMedia).where(eq(s.albumMedia.albumId, album.id))
    const fresh = visible.filter((id) => !existing.has(id))
    if (fresh.length) {
      await this.db.insert(s.albumMedia).values(fresh.map((mediaId, i) => ({ albumId: album.id, mediaId, position: (pos ?? 0) + i + 1, addedBy: user.id, addedAt: new Date() })))
    }
    await this.db.update(s.albums).set({ updatedAt: new Date(), ...(album.coverMediaId === null && fresh.length ? { coverMediaId: fresh[0] } : {}) }).where(eq(s.albums.id, album.id))
    await audit(this.db, { action: 'album.add_media', userId: user.id, subject: { type: 'album', id: album.id }, context: { count: fresh.length }, ip: this.ip })
    return fresh.length
  }

  async removeMedia(album: s.Album, user: User, ids: number[]): Promise<number> {
    const removed = await this.db.delete(s.albumMedia).where(and(eq(s.albumMedia.albumId, album.id), inArray(s.albumMedia.mediaId, ids))).returning()
    await this.db.update(s.albums).set({ updatedAt: new Date(), ...(album.coverMediaId && ids.includes(album.coverMediaId) ? { coverMediaId: null } : {}) }).where(eq(s.albums.id, album.id))
    await audit(this.db, { action: 'album.remove_media', userId: user.id, subject: { type: 'album', id: album.id }, context: { count: removed.length }, ip: this.ip })
    return removed.length
  }

  /**
   * Contagem e capa calculadas apenas sobre o que o utilizador pode ver
   * (um álbum da organização pode conter fotos de bibliotecas a que ele não tem acesso).
   */
  async resources(albums: s.Album[], user: User) {
    if (!albums.length) return []
    const ids = albums.map((a) => a.id)
    const visible = await this.access.visibleCondition(user)
    const stats = new Map((await this.db.select({ albumId: s.albumMedia.albumId, n: count(), first: min(s.albumMedia.mediaId) }).from(s.albumMedia)
      .innerJoin(s.media, eq(s.media.id, s.albumMedia.mediaId)).where(and(inArray(s.albumMedia.albumId, ids), visible))
      .groupBy(s.albumMedia.albumId)).map((r) => [r.albumId, r]))
    const coverIds = albums.map((a) => a.coverMediaId ?? stats.get(a.id)?.first ?? null).filter((v): v is number => v !== null)
    const covers = new Map(coverIds.length ? (await this.db.select().from(s.media).where(and(visible, inArray(s.media.id, coverIds)))).map((m) => [m.id, m]) : [])
    const firsts = albums.map((a) => stats.get(a.id)?.first).filter((v): v is number => typeof v === 'number' && !covers.has(v))
    for (const m of firsts.length ? await this.db.select().from(s.media).where(inArray(s.media.id, firsts)) : []) covers.set(m.id, m)
    const ownerIds = [...new Set(albums.map((a) => a.ownerId))]
    const owners = new Map((await this.db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, ownerIds))).map((o) => [o.id, o]))

    return albums.map((a) => {
      const cover = covers.get(a.coverMediaId ?? -1) ?? covers.get(stats.get(a.id)?.first ?? -1) ?? null
      return {
        id: a.id,
        name: a.name,
        description: a.description,
        visibility: a.visibility,
        media_count: Number(stats.get(a.id)?.n ?? 0),
        cover: cover ? mediaResource(cover) : null,
        owner: owners.get(a.ownerId) ?? null,
        created_at: iso(a.createdAt),
        updated_at: iso(a.updatedAt),
        can: { update: canUpdateAlbum(user, a), delete: canUpdateAlbum(user, a), share: canViewAlbum(user, a) },
      }
    })
  }
}

