import { and, count, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { hasRole, type User } from '../lib/context'
import { hashPassword, randomAlnum, sha256, verifyPassword } from '../lib/crypto'
import { iso } from '../lib/dates'
import { forbidden, notFound, shareExpired, sharePasswordRequired, unauthenticated, validationError } from '../lib/errors'
import { translate, type Locale } from '../lib/i18n'
import { Access } from './access'
import { getSetting } from './settings'

export const isActiveShare = (sh: s.Share) => sh.revokedAt === null && (sh.expiresAt === null || sh.expiresAt.getTime() > Date.now())

export interface ShareInput {
  type: 'album' | 'media'
  album_id?: number | null
  media_ids?: number[]
  audience: 'organisation' | 'users' | 'public'
  user_ids?: number[]
  expires_at?: string | null
  password?: string | null
}

const endOfDay = (d: string) => new Date(`${d}T23:59:59Z`)

/**
 * Links de partilha controlados pela aplicação (nunca links anónimos do OneDrive).
 * O token só é mostrado uma vez; na base de dados guarda-se apenas o seu SHA-256.
 */
export class ShareService {
  constructor(private readonly db: Db, private readonly locale: Locale = 'pt') {}

  async create(user: User, data: ShareInput): Promise<{ share: s.Share; token: string }> {
    let mediaIds: number[] = []
    let album: s.Album | null = null
    const access = new Access(this.db)

    if (data.type === 'album') {
      ;[album] = await this.db.select().from(s.albums).where(and(eq(s.albums.id, data.album_id ?? 0), isNull(s.albums.deletedAt)))
      if (!album) throw validationError('album_id', translate(this.locale, 'errors.not_found'))
      if (album.ownerId !== user.id && album.visibility !== 'organisation' && !hasRole(user, 'photo_admin')) throw forbidden('Cannot share this album')
    } else {
      mediaIds = [...new Set((data.media_ids ?? []).map(Number))]
      const visible = mediaIds.length ? await this.db.select({ id: s.media.id }).from(s.media).where(and(await access.visibleCondition(user), inArray(s.media.id, mediaIds))) : []
      if (!mediaIds.length || visible.length !== mediaIds.length) throw validationError('media_ids', translate(this.locale, 'errors.not_found'))
    }

    let expiresAt = data.expires_at ? endOfDay(data.expires_at) : null
    if (data.audience === 'public') {
      await this.assertPublicAllowed(album, mediaIds)
      const max = endOfDay(new Date(Date.now() + Number(await getSetting(this.db, 'max_share_days')) * 86_400_000).toISOString().slice(0, 10))
      if (!expiresAt || expiresAt > max) expiresAt = max
    }

    const recipients = data.audience === 'users' ? [...new Set((data.user_ids ?? []).map(Number))] : []
    if (recipients.length) {
      const found = await this.db.select({ id: s.users.id }).from(s.users).where(inArray(s.users.id, recipients))
      if (found.length !== recipients.length) throw validationError('user_ids', translate(this.locale, 'errors.not_found'))
    }

    const token = randomAlnum(40)
    const [share] = await this.db.insert(s.shares).values({
      tokenHash: sha256(token), createdBy: user.id, shareableType: data.type, albumId: album?.id ?? null, audience: data.audience,
      passwordHash: data.password ? await hashPassword(data.password) : null, expiresAt,
    }).returning()
    if (mediaIds.length) await this.db.insert(s.shareMedia).values(mediaIds.map((mediaId) => ({ shareId: share.id, mediaId })))
    if (recipients.length) await this.db.insert(s.shareRecipients).values(recipients.map((userId) => ({ shareId: share.id, userId })))
    return { share, token }
  }

  /** Valida o token e as condições de acesso; devolve a partilha activa. */
  async resolve(token: string, viewer: User | null, password: string | null): Promise<s.Share> {
    const [share] = await this.db.select().from(s.shares).where(eq(s.shares.tokenHash, sha256(token)))
    if (!share) throw notFound('Share not found')
    if (!isActiveShare(share)) throw shareExpired()
    if (share.audience !== 'public') {
      if (!viewer) throw unauthenticated('Share requires organisation sign-in')
      if (share.audience === 'users' && viewer.id !== share.createdBy && !(await this.isRecipient(share, viewer))) throw notFound('Not a recipient')
    }
    if (share.passwordHash && !(viewer && viewer.id === share.createdBy)) {
      if (!password || !(await verifyPassword(password, share.passwordHash))) throw sharePasswordRequired(Boolean(password))
    }
    return share
  }

  async isRecipient(share: s.Share, user: User): Promise<boolean> {
    const [hit] = await this.db.select().from(s.shareRecipients).where(and(eq(s.shareRecipients.shareId, share.id), eq(s.shareRecipients.userId, user.id)))
    return Boolean(hit)
  }

  /**
   * Media incluídos na partilha que continuam acessíveis ao criador (se ele perdeu o acesso,
   * a partilha deixa de expor esses itens).
   */
  async mediaConditions(share: s.Share): Promise<SQL[]> {
    const [creator] = await this.db.select().from(s.users).where(eq(s.users.id, share.createdBy))
    const conds = [await new Access(this.db).visibleCondition(creator)]
    conds.push(share.shareableType === 'album'
      ? sql`exists (select 1 from ${s.albumMedia} where ${s.albumMedia.mediaId} = ${s.media.id} and ${s.albumMedia.albumId} = ${share.albumId})`
      : sql`exists (select 1 from ${s.shareMedia} where ${s.shareMedia.mediaId} = ${s.media.id} and ${s.shareMedia.shareId} = ${share.id})`)
    if (share.audience === 'public') {
      conds.push(sql`exists (select 1 from ${s.libraries} where ${s.libraries.id} = ${s.media.libraryId} and ${s.libraries.allowPublicLinks} = true)`)
    }
    return conds
  }

  async items(share: s.Share, limit = 2000): Promise<s.Media[]> {
    return this.db.select().from(s.media).where(and(...(await this.mediaConditions(share)))).orderBy(desc(s.media.sortAt), desc(s.media.id)).limit(limit)
  }

  async findMedia(share: s.Share, mediaId: number): Promise<s.Media> {
    const [m] = await this.db.select().from(s.media).where(and(...(await this.mediaConditions(share)), eq(s.media.id, mediaId)))
    if (!m) throw notFound('Media not in share')
    return m
  }

  async recordAccess(share: s.Share): Promise<void> {
    await this.db.update(s.shares).set({ viewCount: sql`${s.shares.viewCount} + 1`, lastAccessedAt: new Date() }).where(eq(s.shares.id, share.id))
  }

  async title(share: s.Share): Promise<string> {
    if (share.shareableType === 'album') {
      const [album] = share.albumId ? await this.db.select({ name: s.albums.name }).from(s.albums).where(eq(s.albums.id, share.albumId)) : []
      return album?.name ?? ''
    }
    const [{ n }] = await this.db.select({ n: count() }).from(s.shareMedia).where(eq(s.shareMedia.shareId, share.id))
    const en = this.locale === 'en'
    return n === 1 ? (en ? '1 shared photo' : '1 fotografia partilhada') : en ? `${n} shared photos` : `${n} fotografias partilhadas`
  }

  async resources(shares: s.Share[], opts: { creator?: boolean; recipients?: boolean } = {}) {
    if (!shares.length) return []
    const ids = shares.map((x) => x.id)
    const counts = new Map((await this.db.select({ id: s.shareMedia.shareId, n: count() }).from(s.shareMedia).where(inArray(s.shareMedia.shareId, ids)).groupBy(s.shareMedia.shareId)).map((r) => [r.id, r.n]))
    const albumIds = shares.map((x) => x.albumId).filter((v): v is number => v !== null)
    const albums = new Map(albumIds.length ? (await this.db.select({ id: s.albums.id, name: s.albums.name }).from(s.albums).where(inArray(s.albums.id, albumIds))).map((a) => [a.id, a]) : [])
    const creators = opts.creator ? new Map((await this.db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, shares.map((x) => x.createdBy)))).map((u) => [u.id, u])) : null
    const recipients = opts.recipients ? await this.db.select({ shareId: s.shareRecipients.shareId, id: s.users.id, name: s.users.name }).from(s.shareRecipients)
      .innerJoin(s.users, eq(s.users.id, s.shareRecipients.userId)).where(inArray(s.shareRecipients.shareId, ids)) : null

    return Promise.all(shares.map(async (x) => ({
      id: x.id,
      type: x.shareableType,
      audience: x.audience,
      title: await this.title(x),
      album: x.albumId ? (albums.get(x.albumId) ?? null) : null,
      media_count: counts.get(x.id) ?? 0,
      has_password: x.passwordHash !== null,
      expires_at: iso(x.expiresAt),
      revoked_at: iso(x.revokedAt),
      is_active: isActiveShare(x),
      view_count: x.viewCount,
      last_accessed_at: iso(x.lastAccessedAt),
      ...(creators ? { created_by: creators.get(x.createdBy) ?? null } : {}),
      ...(recipients ? { recipients: recipients.filter((r) => r.shareId === x.id).map(({ id, name }) => ({ id, name })) } : {}),
      created_at: iso(x.createdAt),
    })))
  }

  async mine(user: User) {
    return this.db.select().from(s.shares).where(eq(s.shares.createdBy, user.id)).orderBy(desc(s.shares.id)).limit(200)
  }

  async sharedWith(user: User) {
    return this.db.select({ share: s.shares }).from(s.shares)
      .innerJoin(s.shareRecipients, and(eq(s.shareRecipients.shareId, s.shares.id), eq(s.shareRecipients.userId, user.id)))
      .where(and(isNull(s.shares.revokedAt), or(isNull(s.shares.expiresAt), gt(s.shares.expiresAt, new Date())), ne(s.shares.createdBy, user.id)))
      .orderBy(desc(s.shares.id)).limit(200).then((rows) => rows.map((r) => r.share))
  }

  /** Links públicos: opção global activa, bibliotecas que os permitem e identidade de aplicação disponível. */
  private async assertPublicAllowed(album: s.Album | null, mediaIds: number[]): Promise<void> {
    if (!(await getSetting<boolean>(this.db, 'public_links_enabled'))) throw forbidden('Public links disabled', {}, 'errors.public_links_disabled')
    const scope = album
      ? sql`${s.media.id} in (select ${s.albumMedia.mediaId} from ${s.albumMedia} where ${s.albumMedia.albumId} = ${album.id})`
      : mediaIds.length ? inArray(s.media.id, mediaIds) : sql`false`
    const [blocked] = await this.db.select({ id: s.media.id }).from(s.media)
      .innerJoin(s.drives, eq(s.drives.id, s.media.driveId))
      .leftJoin(s.libraries, eq(s.libraries.id, s.media.libraryId))
      .where(and(eq(s.media.sourceState, 'active'), scope, or(eq(s.libraries.allowPublicLinks, false), and(eq(s.drives.authMode, 'delegated'), ne(s.drives.driveType, 'demo'))))).limit(1)
    if (blocked) throw forbidden('Public links disabled', {}, 'errors.public_links_disabled')
  }
}
