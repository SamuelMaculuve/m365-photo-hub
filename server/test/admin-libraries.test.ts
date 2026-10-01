import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { Client, fake, json, makeLibrary, makeMedia, makeUser } from './helpers'
import { testDb } from './setup'

describe('admin: libraries', () => {
  it('admin routes require roles', async () => {
    const viewer = await new Client().actingAs(await makeUser())
    expect((await viewer.get('/api/admin/libraries')).status).toBe(403)
    const photoAdmin = await new Client().actingAs(await makeUser({ role: 'photo_admin' }))
    expect((await photoAdmin.get('/api/admin/libraries')).status).toBe(200)
    expect((await photoAdmin.post('/api/admin/libraries', {})).status).toBe(403)
  })

  it('super admin creates a library from a SharePoint folder', async () => {
    const admin = await makeUser({ role: 'super_admin' })
    fake('/drives/b!lib/items/folder-1', () => json({ id: 'folder-1', name: 'Fotos', folder: { childCount: 3 }, parentReference: { path: '/drives/b!lib/root:' } }))
    fake(/\/drives\/b!lib(\?|$)/, () => json({ id: 'b!lib', name: 'Documentos', driveType: 'documentLibrary', webUrl: 'https://c.sharepoint.com/sites/x/Shared%20Documents' }))

    const res = await (await new Client().actingAs(admin)).post('/api/admin/libraries', {
      name: 'Fotos Institucionais', visibility: 'restricted', roots: [{ drive_id: 'b!lib', item_id: 'folder-1', site_id: 'site-1' }],
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.slug).toBe('fotos-institucionais')
    expect(body.data.roots[0]).toMatchObject({ path: '/Fotos', auth_mode: 'app' })
    const [drive] = await testDb().select().from(s.drives)
    expect(drive).toMatchObject({ driveId: 'b!lib', siteId: 'site-1', authMode: 'app' })
    const logs = await testDb().select().from(s.auditLogs).where(eq(s.auditLogs.action, 'library.create'))
    expect(logs[0].userId).toBe(admin.id)
  })

  it('rejects invalid input with field errors', async () => {
    const client = await new Client().actingAs(await makeUser({ role: 'super_admin' }))
    const res = await client.post('/api/admin/libraries', { visibility: 'everyone' })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(Object.keys(body.error.errors)).toEqual(expect.arrayContaining(['name', 'visibility', 'roots']))
  })

  it('library access grants group members', async () => {
    const admin = await new Client().actingAs(await makeUser({ role: 'super_admin' }))
    const { library } = await makeLibrary()
    const member = await makeUser({ groupIds: ['grp-1'] })

    const res = await admin.put(`/api/admin/libraries/${library.id}/access`, { access: [
      { principal_type: 'group', principal_id: 'grp-1', display_name: 'Comunicação', role: 'editor' },
    ] })
    expect(res.status).toBe(200)
    expect((await res.json()).data[0].role).toBe('editor')
    const me = await (await (await new Client().actingAs(member)).get('/api/users/me')).json()
    expect(me.data.libraries[0]).toMatchObject({ id: library.id, role: 'editor' })
  })

  it('validate reports permission problems', async () => {
    const { library } = await makeLibrary()
    fake('graph.microsoft.com', () => json({ error: { code: 'accessDenied' } }, 403))
    const res = await (await new Client().actingAs(await makeUser({ role: 'super_admin' }))).post(`/api/admin/libraries/${library.id}/validate`)
    const body = await res.json()
    expect(body.data.ok).toBe(false)
    expect(body.data.checks.some((c: { ok: boolean }) => !c.ok)).toBe(true)
  })

  it('deleting a library keeps the files and hides its media', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    const res = await (await new Client().actingAs(await makeUser({ role: 'super_admin' }))).delete(`/api/admin/libraries/${library.id}`)
    expect(res.status).toBe(200)
    const [row] = await testDb().select().from(s.media).where(eq(s.media.id, m.id))
    expect(row).toMatchObject({ libraryId: null, sourceState: 'out_of_scope' })
    expect((await (await new Client().actingAs(await makeUser({ role: 'super_admin' }))).get('/api/admin/libraries')).status).toBe(200)
  })

  it('sync request via the admin API is queued, not run inline', async () => {
    const { library } = await makeLibrary()
    const admin = await new Client().actingAs(await makeUser({ role: 'photo_admin' }))
    const res = await admin.post('/api/admin/sync', { library_id: library.id })
    expect(res.status).toBe(202)
    expect((await res.json()).data[0].status).toBe('queued')
    expect((await (await new Client().actingAs(await makeUser())).post('/api/admin/sync')).status).toBe(403)
    const status = await (await admin.get('/api/admin/sync/status')).json()
    expect(status.data.running).toHaveLength(1)
  })
})
