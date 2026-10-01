import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { DemoDatabase, netlifySnapshotStore } from './demo/runtime'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Calculado só quando é preciso (no bundle das funções não há migrações em tempo de execução). */
export const migrationsDir = () => fileURLToPath(new URL('../../drizzle', import.meta.url))

/**
 * Modos da base de dados:
 * - "postgres": DATABASE_URL definida → esse Postgres, normalmente (o caminho real);
 * - "demo": dentro do Netlify sem DATABASE_URL → PGlite em memória com cópia no Netlify Blobs;
 * - "local": desenvolvimento e testes → PGlite em ficheiro (PGLITE_DIR) ou em memória.
 */
export type DbMode = 'postgres' | 'demo' | 'local'

export function dbMode(): DbMode {
  if (process.env.DATABASE_URL) return 'postgres'
  if (process.env.NETLIFY_FUNCTION === '1') return 'demo'
  return 'local'
}

export const inMemoryDb = () => dbMode() === 'demo'

let current: Db | null = null
let pending: Promise<Db> | null = null
let demo: DemoDatabase | null = null

const demoDb = () => (demo ??= new DemoDatabase(netlifySnapshotStore))

export function getDb(): Promise<Db> {
  if (current) return Promise.resolve(current)
  pending ??= connect().then(
    (db) => (current = db),
    (e) => {
      pending = null // tenta de novo no próximo pedido
      throw e
    },
  )
  return pending
}

/** Antes de cada pedido: no modo demo, recarrega a base se outra instância gravou. */
export async function ensureDatabase(): Promise<Db> {
  if (dbMode() === 'demo') await demoDb().sync()
  return getDb()
}

/** Depois de um pedido (antes de responder): no modo demo, grava a cópia se houve escritas. */
export async function persistDatabase(): Promise<void> {
  if (dbMode() === 'demo') await demoDb().persist()
}

/** Só para testes e para o servidor de desenvolvimento. */
export function setDb(db: Db | null): void {
  current = db
  pending = null
}

async function connect(): Promise<Db> {
  switch (dbMode()) {
    case 'postgres': {
      const { Pool } = await import('pg')
      const { drizzle } = await import('drizzle-orm/node-postgres')
      const url = process.env.DATABASE_URL!
      const ssl = /sslmode=(require|verify)/.test(url) || !/localhost|127\.0\.0\.1/.test(url) ? { rejectUnauthorized: false } : undefined
      return drizzle({ client: new Pool({ connectionString: url, max: 3, ssl }), schema }) as unknown as Db
    }
    case 'demo':
      await demoDb().sync()
      return demoDb().db
    default:
      return createPgliteDb(process.env.PGLITE_DIR)
  }
}

/** PGlite com as migrações aplicadas. Sem `dir` fica em memória. */
export async function createPgliteDb(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const client = dir ? new PGlite(dir) : new PGlite()
  const db = drizzle({ client, schema })
  await migrate(db, { migrationsFolder: migrationsDir() })
  return db as unknown as Db
}
