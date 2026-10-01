import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import type { User } from '../lib/context'
import { forbidden, GraphApiError, mediaUnavailable, notFound } from '../lib/errors'
import { atLeast } from '../lib/roles'
import { Access } from './access'
import { MediaContent } from './content'

/** Operações de escrita sobre media (favoritos, lixo, eliminação na origem). */
export class MediaService {
  constructor(private readonly db: Db, private readonly access = new Access(db), private readonly ip: string | null = null) {}

  /** Media visível para o utilizador: 404 se não existe, 403 se existe mas não lhe é visível. */
  async findVisible(user: User, id: string | number): Promise<s.Media> {
    const n = Number(id)
    const [m] = Number.isInteger(n) ? await this.db.select().from(s.media).where(eq(s.media.id, n)) : []
    if (!m) throw notFound()
    if (!(await this.access.canView(user, m))) throw forbidden()
    return m
  }

  async setFavourite(user: User, ids: number[], value: boolean): Promise<number> {
    if (!ids.length) return 0
    const visible = (await this.db.select({ id: s.media.id }).from(s.media)
      .where(and(await this.access.visibleCondition(user), inArray(s.media.id, ids)))).map((r) => r.id)
    if (!visible.length) return 0
    const now = new Date()
    await this.db.insert(s.userMedia).values(visible.map((id) => ({ userId: user.id, mediaId: id, isFavourite: value, favouritedAt: value ? now : null })))
      .onConflictDoUpdate({ target: [s.userMedia.userId, s.userMedia.mediaId], set: { isFavourite: value, favouritedAt: value ? now : null, updatedAt: now } })
    return visible.length
  }

  /** Bibliotecas onde o utilizador é pelo menos editor. */
  async editableLibraries(user: User): Promise<number[]> {
    return [...(await this.access.libraryRoles(user))].filter(([, r]) => atLeast(r, 'editor')).map(([id]) => id)
  }

  async trashConditions(user: User) {
    const libs = await this.editableLibraries(user)
    return [libs.length ? inArray(s.media.libraryId, libs) : sql`false`, eq(s.media.sourceState, 'active'), isNotNull(s.media.hiddenAt)]
  }

  async trash(user: User, m: s.Media): Promise<s.Media> {
    if (m.sourceState !== 'active' || !(await this.access.hasRoleFor(user, m, 'editor'))) throw forbidden()
    const [updated] = await this.db.update(s.media).set({ hiddenAt: new Date(), hiddenBy: user.id, updatedAt: new Date() }).where(eq(s.media.id, m.id)).returning()
    await audit(this.db, { action: 'media.trash', userId: user.id, subject: { type: 'media', id: m.id }, ip: this.ip })
    return updated
  }

  async restore(user: User, m: s.Media): Promise<void> {
    if (m.sourceState !== 'active' || !(await this.access.hasRoleFor(user, m, 'editor'))) throw forbidden()
    await this.db.update(s.media).set({ hiddenAt: null, hiddenBy: null, updatedAt: new Date() }).where(eq(s.media.id, m.id))
    await audit(this.db, { action: 'media.restore', userId: user.id, subject: { type: 'media', id: m.id }, ip: this.ip })
  }

  /** Envia para a Reciclagem do Microsoft 365 (recuperável lá). Nunca elimina permanentemente. */
  async deleteFromSource(user: User, m: s.Media): Promise<void> {
    const [library] = m.libraryId ? await this.db.select().from(s.libraries).where(eq(s.libraries.id, m.libraryId)) : []
    if (!library?.allowWrites || !(await this.access.hasRoleFor(user, m, 'photo_admin'))) throw forbidden()
    try {
      await new MediaContent(this.db).moveToRecycleBin(m, user)
    } catch (e) {
      if (e instanceof GraphApiError) {
        await audit(this.db, { action: 'media.delete_from_source', userId: user.id, subject: { type: 'media', id: m.id }, result: 'error', context: { graph_status: e.graphStatus }, ip: this.ip })
        if (e.isForbidden) throw forbidden('SharePoint denied deletion')
        if (e.isNotFound) throw mediaUnavailable('Already gone')
      }
      throw e
    }
    await this.db.update(s.media).set({ sourceState: 'removed_at_source', hiddenAt: m.hiddenAt ?? new Date(), updatedAt: new Date() }).where(eq(s.media.id, m.id))
    await audit(this.db, { action: 'media.delete_from_source', userId: user.id, subject: { type: 'media', id: m.id }, ip: this.ip })
  }

  async bulk(user: User, action: 'favorite' | 'unfavorite' | 'trash' | 'restore', ids: number[]): Promise<number> {
    if (action === 'favorite' || action === 'unfavorite') return this.setFavourite(user, ids, action === 'favorite')
    const libs = await this.editableLibraries(user)
    let affected = 0
    if (libs.length) {
      const base = and(inArray(s.media.id, ids), inArray(s.media.libraryId, libs), eq(s.media.sourceState, 'active'))
      const rows = action === 'trash'
        ? await this.db.update(s.media).set({ hiddenAt: new Date(), hiddenBy: user.id }).where(and(base, isNull(s.media.hiddenAt))).returning({ id: s.media.id })
        : await this.db.update(s.media).set({ hiddenAt: null, hiddenBy: null }).where(and(base, isNotNull(s.media.hiddenAt))).returning({ id: s.media.id })
      affected = rows.length
    }
    await audit(this.db, { action: `media.bulk_${action}`, userId: user.id, context: { count: affected, requested: ids.length }, ip: this.ip })
    return affected
  }
}
