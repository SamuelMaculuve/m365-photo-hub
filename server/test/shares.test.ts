import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as s from '../src/db/schema'
import { sha256 } from '../src/lib/crypto'
import { updateSettings } from '../src/services/settings'
import { Client, fake, grant, makeLibrary, makeMedia, makeUser } from './helpers'
import { testDb } from './setup'

const as = async (u: s.User) => new Client().actingAs(u)
const j = async (r: Response) => (await r.json()) as any
const enablePublic = () => updateSettings(testDb(), { public_links_enabled: true }, null)

describe('shares', () => {
  it('public links are disabled by default', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowPublicLinks: true })
    const m = await makeMedia(library, drive)
    expect((await (await as(await makeUser())).post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'public' })).status).toBe(403)
  })

  it('public links require the library permission', async () => {
    await enablePublic()
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowPublicLinks: false })
    const m = await makeMedia(library, drive)
    expect((await (await as(await makeUser())).post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'public' })).status).toBe(403)
  })

  it('public link lifecycle with signed content URLs', async () => {
    await enablePublic()
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowPublicLinks: true })
    const m = await makeMedia(library, drive, { latitude: -25.9, longitude: 32.5 })
    const owner = await as(await makeUser())

    const res = await owner.post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'public' })
    expect(res.status).toBe(201)
    const created = (await j(res)).data
    expect(created.expires_at).toBeTruthy()
    const [row] = await testDb().select().from(s.shares)
    expect(row.tokenHash).toBe(sha256(created.token))

    const anon = new Client()
    const pub = await anon.get(`/api/public/shares/${created.token}`)
    expect(pub.status).toBe(200)
    expect(pub.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    const payload = (await j(pub)).data
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].location).toBeUndefined()
    const thumb = payload.items[0].thumbnails.medium as string
    expect(thumb).toContain('signature=')

    fake('graph.microsoft.com', () => new Response('JPEG', { headers: { 'content-type': 'image/jpeg' } }))
    expect((await anon.get(thumb)).status).toBe(200)
    expect((await anon.get(thumb.replace('signature=', 'signature=x'))).status).toBe(403)

    // Revogar invalida o link e os URLs já emitidos.
    expect((await owner.delete(`/api/shares/${created.id}`)).status).toBe(200)
    const gone = await anon.get(`/api/public/shares/${created.token}`)
    expect(gone.status).toBe(410)
    expect((await j(gone)).error.code).toBe('share_expired')
    expect((await anon.get(thumb)).status).toBe(410)
  })

  it('password protected link', async () => {
    await enablePublic()
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowPublicLinks: true })
    const m = await makeMedia(library, drive)
    const token = (await j(await (await as(await makeUser())).post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'public', password: 'segredo123' }))).data.token
    const anon = new Client()
    const locked = await anon.get(`/api/public/shares/${token}`)
    expect(locked.status).toBe(423)
    expect((await j(locked)).error.code).toBe('share_password_required')
    const wrong = await anon.get(`/api/public/shares/${token}`, { 'x-share-password': 'errada' })
    expect(wrong.status).toBe(423)
    expect((await j(wrong)).error.message).toBe('Palavra-passe incorrecta.')
    expect((await anon.get(`/api/public/shares/${token}`, { 'x-share-password': 'segredo123' })).status).toBe(200)
  })

  it('expired link', async () => {
    const user = await makeUser()
    await testDb().insert(s.shares).values({ tokenHash: sha256('a'.repeat(40)), createdBy: user.id, shareableType: 'media', audience: 'public', expiresAt: new Date(Date.now() - 86_400_000) })
    expect((await new Client().get(`/api/public/shares/${'a'.repeat(40)}`)).status).toBe(410)
  })

  it('share with specific users', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'restricted' })
    const owner = await makeUser()
    await grant(library, owner)
    const m = await makeMedia(library, drive)
    const recipient = await makeUser()
    const stranger = await makeUser()

    const created = await (await as(owner)).post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'users', user_ids: [recipient.id] })
    expect(created.status).toBe(201)
    const shareId = (await j(created)).data.id

    const r = await as(recipient)
    expect((await j(await r.get('/api/shared-with-me'))).data).toHaveLength(1)
    expect((await j(await r.get(`/api/shares/${shareId}/items`))).data.items).toHaveLength(1)
    expect((await r.get(`/api/photos/${m.id}`)).status).toBe(403)
    const st = await as(stranger)
    expect((await st.get(`/api/shares/${shareId}/items`)).status).toBe(404)
    expect((await j(await st.get('/api/shared-with-me'))).data).toHaveLength(0)
  })

  it('cannot share media you cannot see', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'restricted' })
    const m = await makeMedia(library, drive)
    expect((await (await as(await makeUser())).post('/api/shares', { type: 'media', media_ids: [m.id], audience: 'organisation' })).status).toBe(422)
  })

  it('stops exposing media when the creator loses access', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'restricted' })
    const owner = await makeUser()
    await grant(library, owner)
    const [album] = await testDb().insert(s.albums).values({ ownerId: owner.id, name: 'A' }).returning()
    await testDb().insert(s.albumMedia).values({ albumId: album.id, mediaId: (await makeMedia(library, drive)).id })
    const token = (await j(await (await as(owner)).post('/api/shares', { type: 'album', album_id: album.id, audience: 'organisation' }))).data.token

    const viewer = await as(await makeUser())
    expect((await j(await viewer.get(`/api/public/shares/${token}`))).data.items).toHaveLength(1)
    await testDb().delete(s.libraryAccess).where(eq(s.libraryAccess.libraryId, library.id))
    expect((await j(await viewer.get(`/api/public/shares/${token}`))).data.items).toHaveLength(0)
  })
})
