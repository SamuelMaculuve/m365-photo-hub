import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import type { User } from '../lib/context'
import { parseSearch } from './search-parser'
import { escapeLike, type MediaFilters, Timeline } from './timeline'

const ACCENTS_FROM = 'áàâãäåéèêëíìîïóòôõöúùûüçñ'
const ACCENTS_TO = 'aaaaaaeeeeiiiiooooouuuucn'

/** Comparação sem maiúsculas nem acentos ("formacao" encontra "Formação"), portável entre PGlite e Neon. */
export const fold = (v: string) => [...v.toLowerCase()].map((ch) => {
  const i = ACCENTS_FROM.indexOf(ch)
  return i >= 0 ? ACCENTS_TO[i] : ch
}).join('')

const folded = (col: SQL | unknown) => sql`translate(lower(${col}), ${ACCENTS_FROM}, ${ACCENTS_TO})`

/**
 * Pesquisa textual sobre metadados (nome, pasta, local, álbuns, etiquetas).
 * A interface está pronta para ser substituída por um motor dedicado ou pesquisa semântica.
 */
export class Search {
  constructor(private readonly db: Db, private readonly timeline = new Timeline(db)) {}

  async build(user: User, q: string, filters: MediaFilters) {
    const parsed = parseSearch(q)
    const f: MediaFilters = { ...filters }
    f.type ??= parsed.type ?? undefined
    f.favourite = Boolean(filters.favourite) || parsed.favourite
    f.from ??= parsed.from ?? undefined
    f.to ??= parsed.to ?? undefined
    if (parsed.month && !parsed.year) f.month = parsed.month

    const where = await this.timeline.conditions(user, f)
    for (const term of parsed.terms) where.push(this.matchTerm(term, user))

    return {
      where,
      interpreted: { text: parsed.text, type: f.type ?? null, favourite: f.favourite, from: f.from ?? null, to: f.to ?? null, month: f.month ?? null },
    }
  }

  private matchTerm(term: string, user: User): SQL {
    const like = `%${escapeLike(fold(term))}%`
    return or(
      sql`${folded(s.media.name)} like ${like}`,
      sql`${folded(s.media.folderPath)} like ${like}`,
      sql`${folded(s.media.placeName)} like ${like}`,
      sql`exists (select 1 from ${s.albumMedia} join ${s.albums} on ${s.albums.id} = ${s.albumMedia.albumId}
        where ${s.albumMedia.mediaId} = ${s.media.id} and ${s.albums.deletedAt} is null
        and (${s.albums.ownerId} = ${user.id} or ${s.albums.visibility} = 'organisation')
        and ${folded(s.albums.name)} like ${like})`,
      sql`exists (select 1 from ${s.mediaTags} join ${s.tags} on ${s.tags.id} = ${s.mediaTags.tagId}
        where ${s.mediaTags.mediaId} = ${s.media.id} and ${folded(s.tags.name)} like ${like})`,
    )!
  }

  async suggestions(user: User, q: string) {
    const like = `%${escapeLike(fold(q))}%`
    const base = await this.timeline.conditions(user, {})
    const folders = await this.db.selectDistinct({ v: s.media.folderPath }).from(s.media)
      .where(and(...base, sql`${folded(s.media.folderPath)} like ${like}`)).limit(6)
    const places = await this.db.selectDistinct({ v: s.media.placeName }).from(s.media)
      .where(and(...base, isNotNull(s.media.placeName), sql`${folded(s.media.placeName)} like ${like}`)).limit(6)
    const albums = await this.db.select({ id: s.albums.id, name: s.albums.name }).from(s.albums)
      .where(and(isNull(s.albums.deletedAt), or(eq(s.albums.ownerId, user.id), eq(s.albums.visibility, 'organisation')), sql`${folded(s.albums.name)} like ${like}`)).limit(6)
    return { folders: folders.map((r) => r.v).filter(Boolean), albums, places: places.map((r) => r.v).filter(Boolean) }
  }
}
