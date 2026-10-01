import { and, eq, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import type { User } from '../lib/context'
import { iso } from '../lib/dates'
import type { Access } from './access'
import { getSetting } from './settings'

export const SIZES = ['small', 'medium', 'large', 'xlarge'] as const

/** Substitui os URLs por URLs assinados (partilhas públicas). */
export type UrlResolver = (m: s.Media, kind: 'thumbnail' | 'stream' | 'download', size?: string) => string

const defaultUrl: UrlResolver = (m, kind, size) =>
  kind === 'thumbnail' ? `/api/photos/${m.id}/thumbnail/${size}` : `/api/photos/${m.id}/${kind}`

export function mediaResource(m: s.Media & { isFavourite?: boolean }, url: UrlResolver | null = null) {
  const u = url ?? defaultUrl
  return {
    id: m.id,
    name: m.name,
    type: m.mediaType,
    mime_type: m.mimeType,
    width: m.width,
    height: m.height,
    duration_ms: m.durationMs,
    taken_at: iso(m.takenAt),
    sort_at: iso(m.sortAt),
    size: m.size,
    library_id: m.libraryId,
    is_favourite: Boolean(m.isFavourite),
    thumbnails: Object.fromEntries(SIZES.map((size) => [size, u(m, 'thumbnail', size)])),
    stream_url: m.mediaType === 'video' ? u(m, 'stream') : null,
    ...(url ? { download_url: u(m, 'download') } : {}),
  }
}

/** A precisão do GPS segue a definição da organização (exacta, só localidade, ou oculta). */
function location(m: s.Media, precision: string) {
  if ((m.latitude === null && !m.placeName) || precision === 'hidden') return null
  const exact = precision !== 'city' && m.latitude !== null
  return {
    latitude: exact ? m.latitude : null,
    longitude: exact ? m.longitude : null,
    place: m.placeName,
    region: m.placeRegion,
    country: m.placeCountry,
    // Distância das coordenadas à localidade: > 3 km → "perto de".
    distance_km: m.placeDistanceKm,
    source: m.locationSource,
  }
}

export async function mediaDetailResource(db: Db, access: Access, m: s.Media & { isFavourite?: boolean }, user: User) {
  const [library] = m.libraryId ? await db.select().from(s.libraries).where(eq(s.libraries.id, m.libraryId)) : []
  const albums = await db.select({ id: s.albums.id, name: s.albums.name }).from(s.albumMedia)
    .innerJoin(s.albums, eq(s.albums.id, s.albumMedia.albumId))
    .where(and(eq(s.albumMedia.mediaId, m.id), isNull(s.albums.deletedAt), or(eq(s.albums.ownerId, user.id), eq(s.albums.visibility, 'organisation'))))
  const tags = await db.select({ name: s.tags.name, source: s.mediaTags.source }).from(s.mediaTags)
    .innerJoin(s.tags, eq(s.tags.id, s.mediaTags.tagId)).where(eq(s.mediaTags.mediaId, m.id))
  const editor = await access.hasRoleFor(user, m, 'editor')
  return {
    ...mediaResource(m),
    folder_path: m.folderPath,
    web_url: m.webUrl,
    download_url: `/api/photos/${m.id}/download`,
    source_created_at: iso(m.sourceCreatedAt),
    source_modified_at: iso(m.sourceModifiedAt),
    metadata: m.metadata ?? {},
    location: location(m, await getSetting<string>(db, 'gps_precision')),
    albums,
    tags,
    library: library ? { id: library.id, name: library.name } : null,
    ai: null,
    people: [],
    hidden_at: iso(m.hiddenAt),
    can: {
      trash: m.hiddenAt === null && editor,
      restore: m.hiddenAt !== null && editor,
      delete_from_source: Boolean(library?.allowWrites) && (await access.hasRoleFor(user, m, 'photo_admin')),
      share: true,
      add_to_album: true,
    },
  }
}

