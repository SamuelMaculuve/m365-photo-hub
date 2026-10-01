import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import { type AppEnv, requireUser } from '../lib/context'
import { forbidden, notFound, validationError } from '../lib/errors'
import { atLeast } from '../lib/roles'
import { parse } from '../lib/validate'
import { Access } from '../services/access'
import { detectMediaType } from '../services/media-type'
import { findKnownPlace, resolvePlace } from '../services/places'
import { PLACES } from '../services/places-data'
import { withFolded } from '../services/folded'
import { OneDrive } from '../microsoft/onedrive'
import { GraphAuth } from '../microsoft/auth'
import { Cache } from '../lib/cache'
import { AppError } from '../lib/errors'

const locationSchema = z.object({
  ids: z.array(z.number().int()).min(1).max(1000),
  place: z.string().max(120).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  clear: z.boolean().optional(),
  // Por omissão não se substitui GPS real das fotografias.
  overwrite_gps: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if ((d.latitude == null) !== (d.longitude == null)) ctx.addIssue({ code: 'invalid_type', expected: 'number', input: undefined, path: [d.latitude == null ? 'latitude' : 'longitude'] })
})

const uploadSchema = z.object({
  file_name: z.string().min(1).max(200).regex(/^[^\\/:*?"<>|#%]+$/),
  size: z.number().int().min(1).max(15 * 1024 ** 3),
  root_id: z.number().int().nullish(),
})

export const locationRoutes = new Hono<AppEnv>()
  /** Localidades conhecidas, para o selector. */
  .get('/places/catalog', (c) => {
    requireUser(c)
    return c.json({ data: PLACES.map(([name, region, latitude, longitude]) => ({ name, region, latitude, longitude })).sort((a, b) => a.name.localeCompare(b.name)) })
  })
  /** Atribuição manual de local (fotografias sem GPS, ex.: câmaras sem receptor GPS). */
  .post('/photos/location', async (c) => {
    const user = requireUser(c)
    const db = c.get('db')
    const data = parse(locationSchema, await c.req.json().catch(() => ({})))
    const editable = [...(await new Access(db).libraryRoles(user))].filter(([, r]) => atLeast(r, 'editor')).map(([id]) => id)

    let values: Partial<s.Media>
    if (data.clear) {
      values = { latitude: null, longitude: null, placeName: null, placeRegion: null, placeCountry: null, placeDistanceKm: null, locationSource: null, locationSetBy: null }
    } else if (data.latitude != null && data.longitude != null) {
      const place = resolvePlace(data.latitude, data.longitude)
      values = {
        latitude: data.latitude, longitude: data.longitude, placeName: data.place ?? place?.name ?? null, placeRegion: place?.region ?? null,
        placeCountry: place?.country ?? null, placeDistanceKm: data.place ? null : (place?.distanceKm ?? null), locationSource: 'manual', locationSetBy: user.id,
      }
    } else {
      const known = findKnownPlace(data.place ?? '')
      if (!known) throw validationError('place', 'O local indicado não é conhecido.')
      values = { latitude: known[2], longitude: known[3], placeName: known[0], placeRegion: known[1], placeCountry: 'MZ', placeDistanceKm: null, locationSource: 'manual', locationSetBy: user.id }
    }

    const rows = editable.length ? await db.update(s.media).set({ ...withFolded({ placeName: values.placeName ?? null }), ...values, updatedAt: new Date() }).where(and(
      inArray(s.media.id, data.ids), inArray(s.media.libraryId, editable), eq(s.media.sourceState, 'active'),
      data.overwrite_gps ? undefined : or(isNull(s.media.locationSource), inArray(s.media.locationSource, ['estimated', 'manual'])),
    )).returning({ id: s.media.id }) : []
    await audit(db, { action: 'media.location', userId: user.id, context: { count: rows.length, place: values.placeName ?? null, clear: Boolean(data.clear) }, ip: c.get('ip') })
    return c.json({ data: { affected: rows.length, place: values.placeName ?? null } })
  })
  /**
   * Sessão de upload: o browser envia os blocos directamente para a Microsoft (URL pré-autenticado),
   * sem passar ficheiros grandes pela função. O ficheiro aparece na sincronização seguinte.
   */
  .post('/libraries/:id{[0-9]+}/uploads', async (c) => {
    const user = requireUser(c)
    const db = c.get('db')
    const hit = await new Cache(db).hit(`uploads:${user.id}`, 120, 60)
    if (!hit.ok) throw new AppError('too_many_requests', 429, 'Rate limited', {}, { 'Retry-After': String(hit.retryAfter) })
    const [library] = await db.select().from(s.libraries).where(and(eq(s.libraries.id, Number(c.req.param('id'))), isNull(s.libraries.deletedAt)))
    if (!library) throw notFound()
    const data = parse(uploadSchema, await c.req.json().catch(() => ({})))
    const role = await new Access(db).roleIn(user, library.id)
    if (!library.allowWrites || !role || !atLeast(role, 'contributor')) throw forbidden('Writes disabled', {}, 'errors.writes_disabled')
    if (!detectMediaType(data.file_name, null)) throw validationError('file_name', 'Só são aceites fotografias e vídeos.')

    const [root] = await db.select({ root: s.libraryRoots, drive: s.drives }).from(s.libraryRoots).innerJoin(s.drives, eq(s.drives.id, s.libraryRoots.driveId))
      .where(and(eq(s.libraryRoots.libraryId, library.id), data.root_id ? eq(s.libraryRoots.id, data.root_id) : undefined)).limit(1)
    if (!root) throw notFound()
    const session = await new OneDrive().createUploadSession(root.drive.driveId, root.root.rootItemId, data.file_name, new GraphAuth(db).forUser(user))
    await audit(db, { action: 'media.upload_session', userId: user.id, subject: { type: 'library', id: library.id }, context: { file_name: data.file_name, size: data.size }, ip: c.get('ip') })
    // Blocos devem ser múltiplos de 320 KiB (exigência da Microsoft).
    return c.json({ data: { upload_url: session.uploadUrl, expires_at: session.expirationDateTime ?? null, chunk_size: 320 * 1024 * 32 } }, 201)
  })
  // Reconhecimento facial indisponível no Netlify: listas vazias para o frontend.
  .get('/people', (c) => {
    requireUser(c)
    return c.json({ data: [] })
  })
