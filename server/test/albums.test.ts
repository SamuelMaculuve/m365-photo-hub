import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { fold } from '../src/lib/sql'
import { Client, grant, makeLibrary, makeMedia, makeUser } from './helpers'
import { testDb } from './setup'

const as = async (u: s.User) => new Client().actingAs(u)
const j = async (r: Response) => (await r.json()) as any
const makeAlbum = async (attrs: Partial<typeof s.albums.$inferInsert> = {}) =>
  (await testDb().insert(s.albums).values({ ownerId: attrs.ownerId ?? (await makeUser()).id, name: 'Álbum', ...attrs, nameFolded: fold(attrs.name ?? 'Álbum') }).returning())[0]

describe('albums', () => {
  it('creates an album and adds only visible media', async () => {
    const org = await makeLibrary({ visibility: 'organisation' })
    const restricted = await makeLibrary({ visibility: 'restricted' })
    const visible = await makeMedia(org.library, org.drive)
    const secret = await makeMedia(restricted.library, restricted.drive)
    const client = await as(await makeUser())

    const created = await client.post('/api/albums', { name: 'Formação CRP IV' })
    expect(created.status).toBe(201)
    const album = (await j(created)).data
    expect(album.visibility).toBe('private')
    expect((await j(await client.post(`/api/albums/${album.id}/media`, { media_ids: [visible.id, secret.id] }))).data.added).toBe(1)
    const detail = (await j(await client.get(`/api/albums/${album.id}`))).data
    expect(detail).toMatchObject({ media_count: 1, cover: { id: visible.id } })
    expect((await j(await client.get(`/api/albums/${album.id}/media`))).data).toHaveLength(1)
    const logs = await testDb().select().from(s.auditLogs).where(eq(s.auditLogs.action, 'album.create'))
    expect(logs[0].subjectId).toBe(album.id)
  })

  it('private albums are invisible to others', async () => {
    const album = await makeAlbum()
    const other = await as(await makeUser())
    expect((await other.get(`/api/albums/${album.id}`)).status).toBe(403)
    expect((await other.put(`/api/albums/${album.id}`, { name: 'x' })).status).toBe(403)
    expect((await j(await other.get('/api/albums'))).data).toHaveLength(0)
  })

  it('organisation albums show only the media the viewer can access', async () => {
    const org = await makeLibrary({ visibility: 'organisation' })
    const restricted = await makeLibrary({ visibility: 'restricted' })
    const owner = await makeUser()
    await grant(restricted.library, owner)
    const album = await makeAlbum({ ownerId: owner.id, visibility: 'organisation' })
    await testDb().insert(s.albumMedia).values([
      { albumId: album.id, mediaId: (await makeMedia(org.library, org.drive)).id },
      { albumId: album.id, mediaId: (await makeMedia(restricted.library, restricted.drive)).id },
    ])
    const viewer = await as(await makeUser())
    expect((await j(await viewer.get(`/api/albums/${album.id}`))).data.media_count).toBe(1)
    expect((await j(await viewer.get(`/api/albums/${album.id}/media`))).data).toHaveLength(1)
    expect((await j(await (await as(owner)).get(`/api/albums/${album.id}/media`))).data).toHaveLength(2)
  })

  it('deleting an album never deletes media', async () => {
    const org = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(org.library, org.drive)
    const user = await makeUser()
    const album = await makeAlbum({ ownerId: user.id })
    await testDb().insert(s.albumMedia).values({ albumId: album.id, mediaId: m.id })
    expect((await (await as(user)).delete(`/api/albums/${album.id}`)).status).toBe(200)
    const [row] = await testDb().select().from(s.albums).where(eq(s.albums.id, album.id))
    expect(row.deletedAt).not.toBeNull()
    expect(await testDb().select().from(s.media).where(eq(s.media.id, m.id))).toHaveLength(1)
  })

  it('validation errors use the standard envelope in Portuguese', async () => {
    const res = await (await as(await makeUser())).post('/api/albums', {})
    expect(res.status).toBe(422)
    const body = await j(res)
    expect(body.error.code).toBe('validation_error')
    expect(body.error.errors.name[0]).toBe('O campo nome é obrigatório.')
  })

  it('lists albums with classic pagination', async () => {
    const user = await makeUser()
    await makeAlbum({ ownerId: user.id, name: 'Formação' })
    await makeAlbum({ ownerId: user.id, name: 'Reunião' })
    const res = await j(await (await as(user)).get('/api/albums?q=form'))
    expect(res.data.map((a: any) => a.name)).toEqual(['Formação'])
    expect(res.meta).toMatchObject({ current_page: 1, total: 1, last_page: 1 })
  })
})
