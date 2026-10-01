import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { encrypt } from '../src/lib/crypto'
import { updateSettings } from '../src/services/settings'
import { Client, fake, json, makeLibrary, makeMedia, makeUser, sent } from './helpers'
import { testDb } from './setup'

const as = async (user: s.User) => new Client().actingAs(user)
const body = async (res: Response) => (await res.json()) as any
const days = (n: number) => new Date(Date.now() - n * 86_400_000)

describe('photos', () => {
  it('timeline is ordered and cursor paginated', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    for (let i = 1; i <= 5; i++) await makeMedia(library, drive, { sortAt: days(i), takenAt: days(i) })
    const same = new Date(Math.floor(days(3).getTime() / 1000) * 1000)
    await makeMedia(library, drive, { sortAt: same, takenAt: same }) // mesmo sort_at aproximado: desempate por id
    const client = await as(await makeUser())

    const first = await body(await client.get('/api/photos?limit=4'))
    expect(first.data).toHaveLength(4)
    expect(first.meta.next_cursor).toBeTruthy()
    const second = await body(await client.get(`/api/photos?limit=4&cursor=${first.meta.next_cursor}`))
    expect(second.data).toHaveLength(2)
    expect(second.meta.next_cursor).toBeNull()
    const all = [...first.data, ...second.data]
    expect(new Set(all.map((m: any) => m.id)).size).toBe(6)
    const sorted = [...all.map((m: any) => m.sort_at)].sort().reverse()
    expect(all.map((m: any) => m.sort_at)).toEqual(sorted)
  })

  it('ignores an invalid cursor safely', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await makeMedia(library, drive)
    const res = await (await as(await makeUser())).get('/api/photos?cursor=not-a-cursor')
    expect((await body(res)).data).toHaveLength(1)
  })

  it('users only see libraries they can access', async () => {
    const restricted = await makeLibrary({ visibility: 'restricted' })
    const groupLib = await makeLibrary({ visibility: 'restricted' })
    const org = await makeLibrary({ visibility: 'organisation' })
    const disabled = await makeLibrary({ visibility: 'organisation', enabled: false })
    const hidden = await makeMedia(restricted.library, restricted.drive)
    const mGroup = await makeMedia(groupLib.library, groupLib.drive)
    const mOrg = await makeMedia(org.library, org.drive)
    await makeMedia(disabled.library, disabled.drive)
    await testDb().insert(s.libraryAccess).values({ libraryId: groupLib.library.id, principalType: 'group', principalId: 'grp-fotografia', role: 'viewer' })
    const client = await as(await makeUser({ groupIds: ['grp-fotografia'] }))

    const ids = (await body(await client.get('/api/photos'))).data.map((m: any) => m.id).sort()
    expect(ids).toEqual([mGroup.id, mOrg.id].sort())
    const res = await client.get(`/api/photos/${hidden.id}`)
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('forbidden')
    expect((await client.get(`/api/photos/${hidden.id}/thumbnail/medium`)).status).toBe(403)
  })

  it('removed and trashed media are not listed', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const visible = await makeMedia(library, drive)
    await makeMedia(library, drive, { sourceState: 'removed_at_source' })
    await makeMedia(library, drive, { sourceState: 'out_of_scope' })
    await makeMedia(library, drive, { hiddenAt: new Date() })
    const data = (await body(await (await as(await makeUser())).get('/api/photos'))).data
    expect(data.map((m: any) => m.id)).toEqual([visible.id])
  })

  it('filters by type and date', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await makeMedia(library, drive, { sortAt: new Date('2026-09-10T10:00:00Z') })
    const video = await makeMedia(library, drive, { mediaType: 'video', mimeType: 'video/mp4', durationMs: 12000, sortAt: new Date('2026-09-11T10:00:00Z') })
    await makeMedia(library, drive, { sortAt: new Date('2025-01-01T10:00:00Z') })
    const client = await as(await makeUser())

    const videos = (await body(await client.get('/api/photos?type=video'))).data
    expect(videos).toHaveLength(1)
    expect(videos[0]).toMatchObject({ id: video.id, stream_url: `/api/photos/${video.id}/stream` })
    expect((await body(await client.get('/api/photos?from=2026-09-01&to=2026-09-30'))).data).toHaveLength(2)
    expect((await body(await client.get('/api/timeline/buckets'))).data).toEqual([{ month: '2026-09', count: 2 }, { month: '2025-01', count: 1 }])
    expect((await client.get('/api/photos?from=2026-09-30&to=2026-09-01')).status).toBe(422)
  })

  it('favourites are personal', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    const a = await as(await makeUser())
    const b = await as(await makeUser())
    expect((await body(await a.post(`/api/photos/${m.id}/favorite`))).data.is_favourite).toBe(true)
    const favs = (await body(await a.get('/api/photos?favourite=1'))).data
    expect(favs).toHaveLength(1)
    expect(favs[0].is_favourite).toBe(true)
    expect((await body(await b.get('/api/photos?favourite=1'))).data).toHaveLength(0)
    expect((await body(await b.get('/api/photos'))).data[0].is_favourite).toBe(false)
    await a.delete(`/api/photos/${m.id}/favorite`)
    expect((await body(await a.get('/api/photos?favourite=1'))).data).toHaveLength(0)
  })

  it('viewers cannot trash but editors can, and restore', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    const viewer = await as(await makeUser())
    const editor = await as(await makeUser({ role: 'editor' }))
    expect((await viewer.delete(`/api/photos/${m.id}`)).status).toBe(403)
    expect((await editor.delete(`/api/photos/${m.id}`)).status).toBe(200)
    expect((await body(await viewer.get('/api/photos'))).data).toHaveLength(0)
    expect((await body(await editor.get('/api/trash'))).data).toHaveLength(1)
    expect((await body(await viewer.get('/api/trash'))).data).toHaveLength(0)
    expect((await editor.post(`/api/photos/${m.id}/restore`)).status).toBe(200)
    const [row] = await testDb().select().from(s.media).where(eq(s.media.id, m.id))
    expect(row.hiddenAt).toBeNull()
    const logs = await testDb().select().from(s.auditLogs).where(eq(s.auditLogs.action, 'media.trash'))
    expect(logs[0].subjectId).toBe(m.id)
    expect(sent.some((r) => r.method === 'DELETE')).toBe(false)
  })

  it('delete from source requires admin, writes and confirmation', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowWrites: true })
    const m = await makeMedia(library, drive)
    const admin = await makeUser({ role: 'photo_admin' })
    await testDb().insert(s.oauthTokens).values({ userId: admin.id, accessToken: encrypt('user-tok'), refreshToken: encrypt('r'), expiresAt: new Date(Date.now() + 3600_000) })
    fake('graph.microsoft.com', () => new Response(null, { status: 204 }))

    expect((await (await as(await makeUser({ role: 'editor' }))).post(`/api/photos/${m.id}/delete-from-source`, { confirm: 'DELETE' })).status).toBe(403)
    const client = await as(admin)
    expect((await client.post(`/api/photos/${m.id}/delete-from-source`, { confirm: 'yes' })).status).toBe(422)
    expect((await client.post(`/api/photos/${m.id}/delete-from-source`, { confirm: 'DELETE' })).status).toBe(200)
    const del = sent.find((r) => r.method === 'DELETE')!
    expect(del.headers.get('authorization')).toBe('Bearer user-tok')
    expect(del.url).not.toContain('permanentDelete')
    const [row] = await testDb().select().from(s.media).where(eq(s.media.id, m.id))
    expect(row.sourceState).toBe('removed_at_source')
  })

  it('delete from source is blocked when the library is read-only', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowWrites: false })
    const m = await makeMedia(library, drive)
    expect((await (await as(await makeUser({ role: 'super_admin' }))).post(`/api/photos/${m.id}/delete-from-source`, { confirm: 'DELETE' })).status).toBe(403)
  })

  it('fetches the thumbnail from Graph once, then serves it from the cache', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    fake('graph.microsoft.com', () => new Response('JPEGDATA', { headers: { 'content-type': 'image/jpeg' } }))
    const client = await as(await makeUser())
    const res = await client.get(`/api/photos/${m.id}/thumbnail/medium`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(await res.text()).toBe('JPEGDATA')
    expect((await client.get(`/api/photos/${m.id}/thumbnail/medium`)).status).toBe(200)
    expect(sent.filter((r) => r.url.includes('/thumbnails/0/c320x320/content'))).toHaveLength(1)
    expect((await client.get(`/api/photos/${m.id}/thumbnail/huge`)).status).toBe(404)
  })

  it('a missing file returns a friendly error and is marked removed', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    fake('graph.microsoft.com', () => json({ error: { code: 'itemNotFound', message: 'Item not found' } }, 404))
    const res = await (await as(await makeUser())).get(`/api/photos/${m.id}/thumbnail/medium`)
    expect(res.status).toBe(502)
    expect((await body(res)).error).toMatchObject({ code: 'media_unavailable', message: expect.stringContaining('indisponível') })
    const [row] = await testDb().select().from(s.media).where(eq(s.media.id, m.id))
    expect(row.sourceState).toBe('removed_at_source')
  })

  it('Graph throttling returns 503 with Retry-After', async () => {
    process.env.MICROSOFT_GRAPH_MAX_RETRIES = '1'
    try {
      const { library, drive } = await makeLibrary({ visibility: 'organisation' })
      const m = await makeMedia(library, drive)
      fake('graph.microsoft.com', () => json({}, 429, { 'retry-after': '30' }))
      const res = await (await as(await makeUser())).get(`/api/photos/${m.id}/stream`)
      expect(res.status).toBe(503)
      expect((await body(res)).error.code).toBe('graph_throttled')
      expect(res.headers.get('retry-after')).toBe('30')
    } finally {
      delete process.env.MICROSOFT_GRAPH_MAX_RETRIES
    }
  })

  it('stream redirects to the temporary Microsoft URL without exposing tokens', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const video = await makeMedia(library, drive, { mediaType: 'video', mimeType: 'video/mp4' })
    fake('graph.microsoft.com', () => new Response(null, { status: 302, headers: { location: 'https://contoso.sharepoint.com/download.aspx?tempauth=abc' } }))
    const res = await (await as(await makeUser())).get(`/api/photos/${video.id}/stream`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://contoso.sharepoint.com/download.aspx?tempauth=abc')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('detail hides GPS when configured', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive, { latitude: -25.96, longitude: 32.57, placeName: 'Maputo' })
    const client = await as(await makeUser())
    expect((await body(await client.get(`/api/photos/${m.id}`))).data.location.latitude).toBe(-25.96)
    await updateSettings(testDb(), { gps_precision: 'city' }, null)
    const loc = (await body(await client.get(`/api/photos/${m.id}`))).data.location
    expect(loc).toMatchObject({ latitude: null, place: 'Maputo' })
  })

  it('bulk actions respect permissions', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const ids = [(await makeMedia(library, drive)).id, (await makeMedia(library, drive)).id, (await makeMedia(library, drive)).id]
    const viewer = await as(await makeUser())
    expect((await body(await viewer.post('/api/photos/bulk', { action: 'favorite', ids }))).data.affected).toBe(3)
    expect((await body(await viewer.post('/api/photos/bulk', { action: 'trash', ids }))).data.affected).toBe(0)
    expect((await body(await (await as(await makeUser({ role: 'editor' }))).post('/api/photos/bulk', { action: 'trash', ids }))).data.affected).toBe(3)
  })

  it('lists accessible libraries with counts', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation', allowWrites: true })
    await makeMedia(library, drive)
    await makeLibrary({ visibility: 'restricted' })
    const data = (await body(await (await as(await makeUser())).get('/api/libraries'))).data
    expect(data).toEqual([{ id: library.id, name: library.name, description: null, media_count: 1, allow_writes: true }])
  })
})
