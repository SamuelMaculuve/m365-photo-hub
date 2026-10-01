import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { AppError } from '../src/lib/errors'
import { SyncManager } from '../src/services/sync/manager'
import { fake, json, makeLibrary, makeUser } from './helpers'
import { testDb } from './setup'

let library: s.Library
let drive: s.Drive
let pages: Record<string, { body: unknown; status?: number }> = {}

const base = () => `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(drive.driveId)}/root/delta`

function page(token: string, items: unknown[], opts: { next?: string; delta?: string; status?: number } = {}) {
  const body: Record<string, unknown> = { value: items }
  if (opts.next) body['@odata.nextLink'] = `${base()}?token=${opts.next}`
  if (opts.delta) body['@odata.deltaLink'] = `${base()}?token=${opts.delta}`
  pages[token] = { body: opts.status && opts.status !== 200 ? { error: { code: 'resyncRequired' } } : body, status: opts.status ?? 200 }
}

const folder = (id: string, parent: string | null, name: string) => ({ id, name, folder: { childCount: 1 }, parentReference: { id: parent } })
const file = (id: string, parent: string, name: string, extra: Record<string, any> = {}) => ({
  id, name, size: 1000, eTag: `e-${id}`, cTag: `c-${id}`, webUrl: `https://contoso.sharepoint.com/${name}`,
  parentReference: { id: parent },
  fileSystemInfo: { createdDateTime: '2026-01-01T10:00:00Z', lastModifiedDateTime: '2026-01-02T10:00:00Z' },
  ...extra,
  file: { mimeType: 'image/jpeg', hashes: { quickXorHash: `h-${id}` }, ...(extra.file ?? {}) },
})

const manager = () => new SyncManager(testDb())
const runAll = async () => { while (await manager().work(Date.now() + 60_000)); }
const mediaByItem = async (itemId: string) => (await testDb().select().from(s.media).where(eq(s.media.itemId, itemId)))[0]
const job = async (id: number) => (await testDb().select().from(s.syncJobs).where(eq(s.syncJobs.id, id)))[0]

async function runInitialSync() {
  page('initial', [
    { id: 'root', name: 'root', root: {}, folder: { childCount: 2 } },
    folder('photos', 'root', 'Fotos'),
    folder('y2026', 'photos', '2026'),
    folder('docs', 'root', 'Documentos'),
    file('img1', 'y2026', 'IMG_1.jpg', { photo: { takenDateTime: '2026-09-28T08:30:00Z', cameraMake: 'Canon' }, image: { width: 4000, height: 3000 } }),
    file('pdf', 'y2026', 'Relatório.pdf', { file: { mimeType: 'application/pdf' } }),
    file('vid', 'photos', 'Video.mov', { file: { mimeType: 'video/quicktime' }, video: { duration: 65000, width: 1920, height: 1080 } }),
    file('out', 'docs', 'Fora.jpg'),
    file('nodate', 'y2026', 'IMG_sem_data.jpg'),
  ], { next: 'p2' })
  // Ficheiro chega antes da sua pasta (ordem não garantida entre páginas).
  page('p2', [file('heic', 'late', 'IMG_2.HEIC', { file: { mimeType: 'image/heic' } })], { next: 'p3' })
  page('p3', [folder('late', 'photos', 'Tardia')], { delta: 'd1' })
  const j = await manager().start(drive, 'initial')
  await runAll()
  return job(j.id)
}

async function incremental() {
  const j = await manager().start(drive, 'incremental')
  await runAll()
  return job(j.id)
}

beforeEach(async () => {
  pages = {}
  ;({ library, drive } = await makeLibrary({ visibility: 'organisation' }, 'photos'))
  fake('graph.microsoft.com', (req) => {
    const token = new URL(req.url).searchParams.get('token') ?? 'initial'
    const p = pages[token]
    return p ? json(p.body, p.status ?? 200) : json({ error: { code: 'unexpected' } }, 500)
  })
})

describe('drive sync', () => {
  it('initial sync discovers media in scope only', async () => {
    const j = await runInitialSync()
    expect(j.status).toBe('completed')
    expect(j.processed).toBe(11)

    const active = await testDb().select().from(s.media).where(eq(s.media.sourceState, 'active'))
    expect(active.map((m) => m.itemId).sort()).toEqual(['heic', 'img1', 'nodate', 'vid'])
    expect(await mediaByItem('pdf')).toBeUndefined()
    expect((await mediaByItem('out')).sourceState).toBe('out_of_scope')

    const img = await mediaByItem('img1')
    expect(img.libraryId).toBe(library.id)
    expect(img.folderPath).toBe('/Fotos/2026')
    expect(img.takenAt?.toISOString()).toBe('2026-09-28T08:30:00.000Z')
    expect(img.sortAt.toISOString()).toBe(img.takenAt?.toISOString())
    expect(img.metadata?.camera_make).toBe('Canon')

    const vid = await mediaByItem('vid')
    expect(vid.mediaType).toBe('video')
    expect(vid.durationMs).toBe(65000)
    expect((await mediaByItem('heic')).folderPath).toBe('/Fotos/Tardia')
    // Sem data de captura: usa a data de criação.
    expect((await mediaByItem('nodate')).sortAt.toISOString()).toBe('2026-01-01T10:00:00.000Z')

    const [state] = await testDb().select().from(s.driveSyncStates).where(eq(s.driveSyncStates.driveId, drive.id))
    expect(state.deltaLink).toContain('token=d1')
    expect(j.state).toBeNull()
  })

  it('splits work across invocations and resumes from the checkpoint', async () => {
    page('initial', [{ id: 'root', name: 'root', root: {}, folder: {} }, folder('photos', 'root', 'Fotos'), file('a', 'late', 'A.jpg')], { next: 'p2' })
    page('p2', [file('b', 'photos', 'B.jpg')], { next: 'p3' })
    page('p3', [folder('late', 'photos', 'Tardia')], { delta: 'd1' })
    const j = await manager().start(drive, 'initial')

    // Prazo já esgotado: cada invocação processa uma só página.
    expect(await manager().work(Date.now() - 1)).toBe(true)
    let current = await job(j.id)
    expect(current.status).toBe('running')
    expect(current.state?.pending?.map((p) => p.item.id)).toEqual(['a'])
    const [state] = await testDb().select().from(s.driveSyncStates).where(eq(s.driveSyncStates.driveId, drive.id))
    expect(state.resumeLink).toContain('token=p2')

    await manager().work(Date.now() - 1)
    await manager().work(Date.now() - 1)
    current = await job(j.id)
    expect(current.status).toBe('completed')
    expect((await mediaByItem('a')).folderPath).toBe('/Fotos/Tardia')
    expect((await mediaByItem('b')).sourceState).toBe('active')
  })

  it('incremental sync handles rename, move and delete', async () => {
    await runInitialSync()
    const imgId = (await mediaByItem('img1')).id
    page('d1', [
      file('img1', 'y2026', 'Formação.jpg', { eTag: 'e-new' }), // renomear: mesmo cTag
      { id: 'vid', deleted: { state: 'deleted' } },
      folder('late', 'docs', 'Tardia'), // mover a pasta para fora do âmbito
    ], { delta: 'd2' })

    const j = await incremental()
    expect(j.status).toBe('completed')
    const img = await mediaByItem('img1')
    expect(img.id).toBe(imgId)
    expect(img.name).toBe('Formação.jpg')
    expect(img.takenAt?.toISOString()).toBe('2026-09-28T08:30:00.000Z')
    expect((await mediaByItem('vid')).sourceState).toBe('removed_at_source')
    let heic = await mediaByItem('heic')
    expect(heic.sourceState).toBe('out_of_scope')
    expect(heic.libraryId).toBeNull()

    // Mover de volta para dentro do âmbito reactiva o item com o novo caminho.
    page('d2', [folder('late', 'y2026', 'Tardia')], { delta: 'd3' })
    await incremental()
    heic = await mediaByItem('heic')
    expect(heic.sourceState).toBe('active')
    expect(heic.folderPath).toBe('/Fotos/2026/Tardia')
    expect(heic.libraryId).toBe(library.id)
  })

  it('deleting a folder removes its media', async () => {
    await runInitialSync()
    page('d1', [{ id: 'y2026', deleted: { state: 'deleted' }, folder: {} }], { delta: 'd2' })
    await incremental()
    expect((await mediaByItem('img1')).sourceState).toBe('removed_at_source')
    expect((await mediaByItem('nodate')).sourceState).toBe('removed_at_source')
    expect((await mediaByItem('vid')).sourceState).toBe('active')
  })

  it('expired delta token triggers a full resync with sweep', async () => {
    await runInitialSync()
    page('d1', [], { status: 410 })
    pages.initial = { body: { value: [
      { id: 'root', name: 'root', root: {}, folder: {} },
      folder('photos', 'root', 'Fotos'),
      folder('y2026', 'photos', '2026'),
      file('img1', 'y2026', 'IMG_1.jpg', { photo: { takenDateTime: '2026-09-28T08:30:00Z' } }),
    ], '@odata.deltaLink': `${base()}?token=fresh` } }

    const j = await incremental()
    expect(j.type).toBe('full_resync')
    expect(j.status).toBe('completed')
    const logs = await testDb().select().from(s.syncLogs).where(and(eq(s.syncLogs.syncJobId, j.id), eq(s.syncLogs.code, 'resync_required')))
    expect(logs).toHaveLength(1)
    expect((await mediaByItem('img1')).sourceState).toBe('active')
    expect((await mediaByItem('vid')).sourceState).toBe('removed_at_source')
  })

  it('album references survive a resync', async () => {
    await runInitialSync()
    const m = await mediaByItem('img1')
    const user = await makeUser()
    const [album] = await testDb().insert(s.albums).values({ ownerId: user.id, name: 'Álbum' }).returning()
    await testDb().insert(s.albumMedia).values({ albumId: album.id, mediaId: m.id })
    page('d1', [file('img1', 'y2026', 'Renomeado.jpg')], { delta: 'd2' })
    await incremental()
    expect((await mediaByItem('img1')).id).toBe(m.id)
    expect(await testDb().select().from(s.albumMedia)).toHaveLength(1)
  })

  it('cannot start two syncs for the same drive', async () => {
    await testDb().insert(s.syncJobs).values({ driveId: drive.id, type: 'incremental', status: 'running' })
    await expect(manager().start(drive, 'incremental')).rejects.toBeInstanceOf(AppError)
  })

  it('a stale running job does not block forever', async () => {
    const [stale] = await testDb().insert(s.syncJobs).values({ driveId: drive.id, type: 'incremental', status: 'running', updatedAt: new Date(Date.now() - 3 * 3600_000) }).returning()
    await runInitialSync()
    expect((await job(stale.id)).status).toBe('failed')
  })

  it('Graph failures mark the job failed after the retry attempts', async () => {
    process.env.MICROSOFT_GRAPH_MAX_RETRIES = '0'
    try {
      const j = await manager().start(drive, 'initial')
      for (let i = 0; i < 3; i++) await manager().work(Date.now() + 10_000)
      expect((await job(j.id)).status).toBe('failed')
      const [state] = await testDb().select().from(s.driveSyncStates).where(eq(s.driveSyncStates.driveId, drive.id))
      expect(state.status).toBe('failed')
      const logs = await testDb().select().from(s.syncLogs).where(and(eq(s.syncLogs.syncJobId, j.id), eq(s.syncLogs.code, 'sync_failed')))
      expect(logs).toHaveLength(1)
    } finally {
      delete process.env.MICROSOFT_GRAPH_MAX_RETRIES
    }
  })
})
