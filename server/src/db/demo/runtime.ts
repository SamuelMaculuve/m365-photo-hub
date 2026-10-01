import { createHash, randomUUID } from 'node:crypto'
import type { Db } from '../client'
import { openMemoryDatabase, snapshotMemoryDatabase, type MemoryDatabase } from './memory-db'
import { SCHEMA_SQL } from './schema.generated'
import { seedDemo } from './seed'

/**
 * Modo demonstração: Postgres em memória (PGlite) dentro da função, com a base inteira guardada
 * como cópia comprimida no Netlify Blobs. Cada instância recarrega a cópia quando outra gravou uma
 * versão nova, e grava a sua depois de cada pedido que alterou dados.
 *
 * Limite conhecido: duas escritas simultâneas em instâncias diferentes — a última gravação ganha.
 * Serve para demonstrações, não para produção com muitos utilizadores.
 */

export interface SnapshotStore {
  /** Versão publicada (metadata.version), ou null se não existe cópia. */
  version(key: string): Promise<string | null>
  get(key: string): Promise<{ data: Blob; version: string } | null>
  /** onlyIfNew: só grava se ainda não existir; devolve false se outra instância publicou primeiro. */
  put(key: string, data: Blob, version: string, onlyIfNew?: boolean): Promise<boolean>
}

/** Netlify Blobs (consistência forte: um pedido vê logo o que outro gravou). */
export async function netlifySnapshotStore(): Promise<SnapshotStore | null> {
  try {
    const { getStore } = await import('@netlify/blobs')
    const store = getStore({ name: 'demo-db', consistency: 'strong' })
    return {
      async version(key) {
        const meta = await store.getMetadata(key)
        return meta ? String(meta.metadata?.version ?? '') || null : null
      },
      async get(key) {
        const hit = await store.getWithMetadata(key, { type: 'blob' })
        return hit ? { data: hit.data, version: String(hit.metadata?.version ?? '') } : null
      },
      async put(key, data, version, onlyIfNew = false) {
        const res = await store.set(key, data, { metadata: { version, at: new Date().toISOString() }, ...(onlyIfNew ? { onlyIfNew: true } : {}) })
        return res.modified
      },
    }
  } catch (e) {
    console.warn('Netlify Blobs indisponível: a base de demonstração fica só em memória.', (e as Error)?.message)
    return null
  }
}

/** Uma alteração ao esquema começa uma base nova (outra chave). */
export const snapshotKey = () => `app-${createHash('sha256').update(SCHEMA_SQL).digest('hex').slice(0, 12)}`

export class DemoDatabase {
  private mem: MemoryDatabase | null = null
  private version: string | null = null
  private queue: Promise<unknown> = Promise.resolve()

  private resolvedStore: Promise<SnapshotStore | null> | null = null

  constructor(private readonly findStore: () => Promise<SnapshotStore | null>, private readonly key = snapshotKey()) {}

  /** Resolvido uma vez por instância. */
  private store(): Promise<SnapshotStore | null> {
    return (this.resolvedStore ??= this.findStore())
  }

  /** Cliente Drizzle que aponta sempre para a base carregada no momento (mesmo depois de a recarregar). */
  readonly db: Db = new Proxy({} as Db, {
    get: (_t, prop) => {
      if (!this.mem) throw new Error('Base de demonstração ainda não carregada')
      const value = Reflect.get(this.mem.db as object, prop)
      return typeof value === 'function' ? value.bind(this.mem.db) : value
    },
  })

  /** Em série com persist(): nunca recarregar e gravar ao mesmo tempo. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Antes de cada pedido: carregar a base, ou recarregá-la se outra instância gravou uma versão nova. */
  sync(): Promise<void> {
    return this.serial(async () => {
      const store = await this.store()
      if (!store) {
        if (!this.mem) await this.replace(await this.fresh(), null)
        return
      }
      const published = await store.version(this.key)
      if (published && published === this.version && this.mem) return
      if (published) {
        const hit = await store.get(this.key)
        if (hit) {
          await this.replace(await openMemoryDatabase(hit.data), hit.version)
          return
        }
      }
      // Primeira vez (ou cópia apagada para repor a demonstração): criar, semear e publicar.
      const mem = await this.fresh()
      const version = randomUUID()
      if (await store.put(this.key, await snapshotMemoryDatabase(mem), version, true)) {
        await this.replace(mem, version)
        return
      }
      // Outra instância publicou primeiro: usar a dela.
      await mem.pg.close()
      const theirs = await store.get(this.key)
      if (!theirs) throw new Error('Cópia da base de demonstração desapareceu durante a publicação')
      await this.replace(await openMemoryDatabase(theirs.data), theirs.version)
    })
  }

  /** Depois de um pedido que alterou dados (antes de responder): gravar a cópia com uma versão nova. */
  persist(): Promise<void> {
    return this.serial(async () => {
      if (!this.mem?.isDirty()) return
      const store = await this.store()
      if (!store) return this.mem.markClean()
      const version = randomUUID()
      await store.put(this.key, await snapshotMemoryDatabase(this.mem), version)
      this.version = version
      this.mem.markClean()
    })
  }

  get loadedVersion() {
    return this.version
  }

  private async fresh(): Promise<MemoryDatabase> {
    const mem = await openMemoryDatabase()
    await seedDemo(mem.db)
    mem.markClean()
    return mem
  }

  private async replace(mem: MemoryDatabase, version: string | null): Promise<void> {
    const previous = this.mem
    this.mem = mem
    this.version = version
    if (previous) await previous.pg.close().catch(() => undefined)
  }
}
