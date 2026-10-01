import { count, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { DemoDatabase, type SnapshotStore } from '../src/db/demo/runtime'
import { SCHEMA_SQL } from '../src/db/demo/schema.generated'
import { Client, makeLibrary, makeMedia, makeUser } from './helpers'
import { testDb } from './setup'

/** Netlify Blobs simulado (partilhado entre "instâncias"), com onlyIfNew e versão nos metadados. */
function fakeStore() {
  const items = new Map<string, { data: Blob; version: string }>()
  const puts: string[] = []
  const store: SnapshotStore = {
    async version(key) { return items.get(key)?.version ?? null },
    async get(key) { return items.get(key) ?? null },
    async put(key, data, version, onlyIfNew) {
      if (onlyIfNew && items.has(key)) return false
      items.set(key, { data, version })
      puts.push(version)
      return true
    },
  }
  return { store, items, puts }
}

const libraries = async (d: DemoDatabase) => (await d.db.select({ n: count() }).from(s.libraries))[0].n

describe('demo database (PGlite + Blobs)', () => {
  it('generated schema matches the drizzle migrations', async () => {
    // @ts-expect-error módulo JS sem tipos
    const { schemaSql } = await import('../scripts/gen-schema-sql.mjs')
    expect(SCHEMA_SQL).toBe(schemaSql())
  })

  it('first instance creates, seeds and publishes; the second loads the same copy', async () => {
    const { store, puts } = fakeStore()
    const a = new DemoDatabase(async () => store, 'k')
    await a.sync()
    expect(await libraries(a)).toBe(1)
    expect(puts).toHaveLength(1)

    const b = new DemoDatabase(async () => store, 'k')
    await b.sync()
    expect(b.loadedVersion).toBe(a.loadedVersion)
    const [{ n }] = await b.db.select({ n: count() }).from(s.media)
    expect(n).toBeGreaterThan(40)
  })

  it('writes are persisted with a new version and reloaded by other instances', async () => {
    const { store, puts } = fakeStore()
    const a = new DemoDatabase(async () => store, 'k')
    const b = new DemoDatabase(async () => store, 'k')
    await a.sync()
    await b.sync()

    // Só leituras: nada a gravar.
    await a.db.select().from(s.albums)
    await a.persist()
    expect(puts).toHaveLength(1)

    const [owner] = await a.db.select().from(s.users).limit(1)
    await a.db.insert(s.albums).values({ ownerId: owner.id, name: 'Novo álbum' })
    await a.persist()
    expect(puts).toHaveLength(2)

    await b.sync() // outra versão publicada → recarrega
    expect(b.loadedVersion).toBe(a.loadedVersion)
    const names = (await b.db.select({ name: s.albums.name }).from(s.albums)).map((r) => r.name)
    expect(names).toContain('Novo álbum')
  })

  it('concurrent first starts: only one publishes, the other uses its copy', async () => {
    const { store, puts } = fakeStore()
    const a = new DemoDatabase(async () => store, 'k')
    const b = new DemoDatabase(async () => store, 'k')
    await Promise.all([a.sync(), b.sync()])
    expect(puts).toHaveLength(1)
    expect(a.loadedVersion).toBe(b.loadedVersion)
  })

  it('without Netlify Blobs it stays in memory', async () => {
    const d = new DemoDatabase(async () => null, 'k')
    await d.sync()
    await d.db.update(s.libraries).set({ name: 'X' })
    await d.persist()
    expect(await libraries(d)).toBe(1)
  })
})

describe('demo media', () => {
  it('demo photos get generated SVG thumbnails and a public original', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await testDb().update(s.drives).set({ driveType: 'demo' }).where(eq(s.drives.id, drive.id))
    const m = await makeMedia(library, drive, { placeName: 'Pemba' })
    const client = await new Client().actingAs(await makeUser())
    const res = await client.get(`/api/photos/${m.id}/thumbnail/medium`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(await res.text()).toContain('Pemba')
    const dl = await client.get(`/api/photos/${m.id}/download`)
    expect(dl.headers.get('location')).toBe(`/api/demo-media/${m.id}`)
    expect((await new Client().get(`/api/demo-media/${m.id}`)).status).toBe(200)
  })

  it('real (non-demo) media is never served by the public demo route', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const m = await makeMedia(library, drive)
    expect((await new Client().get(`/api/demo-media/${m.id}`)).status).toBe(404)
  })
})
