import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { audit } from '../src/lib/audit'
import { encrypt } from '../src/lib/crypto'
import { Client, fake, json, makeLibrary, makeMedia, makeUser } from './helpers'
import { testDb } from './setup'

const as = async (u: s.User) => new Client().actingAs(u)
const j = async (r: Response) => (await r.json()) as any

describe('admin: users, audit, settings, dashboard', () => {
  it('manages roles and protects the admin from changing themself', async () => {
    const admin = await makeUser({ role: 'super_admin' })
    const user = await makeUser()
    const client = await as(admin)
    const res = await j(await client.put(`/api/admin/users/${user.id}`, { role: 'editor' }))
    expect(res.data).toMatchObject({ role: 'editor', role_source: 'local' })
    expect((await client.put(`/api/admin/users/${admin.id}`, { role: 'viewer' })).status).toBe(422)
    expect((await client.put(`/api/admin/users/${user.id}`, { is_active: false })).status).toBe(200)
    const [fresh] = await testDb().select().from(s.users).where(eq(s.users.id, user.id))
    expect((await (await as(fresh)).get('/api/photos')).status).toBe(403)
  })

  it('audit log is cursor paginated and contains no secrets', async () => {
    const admin = await makeUser({ role: 'super_admin' })
    await audit(testDb(), { action: 'test.action', userId: admin.id, context: { password: 'x', token: 'y', ok: 1 } })
    const row = (await j(await (await as(admin)).get('/api/admin/audit-logs?action=test'))).data[0]
    expect(row.context).toEqual({ ok: 1 })
    expect(row.user).toMatchObject({ id: admin.id })
  })

  it('updates settings with validation', async () => {
    const client = await as(await makeUser({ role: 'super_admin' }))
    const res = await j(await client.put('/api/admin/settings', { faces_enabled: true, gps_precision: 'city' }))
    expect(res.data).toMatchObject({ faces_enabled: true, ai_enabled: false, gps_precision: 'city' })
    expect((await client.put('/api/admin/settings', { gps_precision: 'bad' })).status).toBe(422)
  })

  it('dashboard summarises the archive', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await makeMedia(library, drive)
    await makeMedia(library, drive, { mediaType: 'video' })
    const res = await j(await (await as(await makeUser({ role: 'photo_admin' }))).get('/api/admin/dashboard'))
    expect(res.data).toMatchObject({ photos: 1, videos: 1, status: 'healthy', storage_bytes: 4_000_000 })
  })
})

describe('location and uploads', () => {
  it('editors set a manual place without overwriting real GPS', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const noGps = await makeMedia(library, drive)
    const withGps = await makeMedia(library, drive, { latitude: 1, longitude: 1, locationSource: 'graph' })
    const viewer = await as(await makeUser())
    expect((await j(await viewer.post('/api/photos/location', { ids: [noGps.id], place: 'Pemba' }))).data.affected).toBe(0)
    const editor = await as(await makeUser({ role: 'editor' }))
    const res = await j(await editor.post('/api/photos/location', { ids: [noGps.id, withGps.id], place: 'Pemba' }))
    expect(res.data).toEqual({ affected: 1, place: 'Pemba' })
    const [row] = await testDb().select().from(s.media).where(eq(s.media.id, noGps.id))
    expect(row).toMatchObject({ placeName: 'Pemba', locationSource: 'manual' })
    expect((await editor.post('/api/photos/location', { ids: [noGps.id], place: 'Atlântida' })).status).toBe(422)
    expect((await j(await editor.get('/api/places/catalog'))).data.length).toBeGreaterThan(10)
  })

  it('sync resolves place names from Graph GPS', async () => {
    const { toMediaAttributes } = await import('../src/services/sync/mapper')
    const attrs = toMediaAttributes({ id: 'x', name: 'a.jpg', location: { latitude: -12.97, longitude: 40.52 } }, 'image')
    expect(attrs).toMatchObject({ placeName: 'Pemba', placeRegion: 'Cabo Delgado', locationSource: 'graph' })
  })

  it('upload sessions require writes and contributor role', async () => {
    const { library } = await makeLibrary({ visibility: 'organisation', allowWrites: true })
    const user = await makeUser({ role: 'contributor' })
    await testDb().insert(s.oauthTokens).values({ userId: user.id, accessToken: encrypt('user-tok'), expiresAt: new Date(Date.now() + 3600_000) })
    fake('createUploadSession', () => json({ uploadUrl: 'https://contoso.sharepoint.com/upload?x', expirationDateTime: '2026-10-02T00:00:00Z' }))

    const viewer = await as(await makeUser())
    expect((await viewer.post(`/api/libraries/${library.id}/uploads`, { file_name: 'IMG.jpg', size: 100 })).status).toBe(403)
    const client = await as(user)
    expect((await client.post(`/api/libraries/${library.id}/uploads`, { file_name: 'doc.pdf', size: 100 })).status).toBe(422)
    const res = await client.post(`/api/libraries/${library.id}/uploads`, { file_name: 'IMG.jpg', size: 100 })
    expect(res.status).toBe(201)
    expect((await j(res)).data).toMatchObject({ upload_url: 'https://contoso.sharepoint.com/upload?x', chunk_size: 10485760 })
  })
})
