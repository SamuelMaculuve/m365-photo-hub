import { fileURLToPath } from 'node:url'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Calculado só quando é preciso (no bundle das funções não há migrações em tempo de execução). */
export const migrationsDir = () => fileURLToPath(new URL('../../drizzle', import.meta.url))

let current: Db | null = null
let pending: Promise<Db> | null = null

/**
 * Base de dados da aplicação:
 * - produção (Netlify): Postgres serverless da Netlify DB / Neon (NETLIFY_DATABASE_URL ou DATABASE_URL);
 * - desenvolvimento e testes: PGlite (Postgres embutido), em ficheiro (PGLITE_DIR) ou em memória.
 */
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

/** Só para testes e para o servidor de desenvolvimento. */
export function setDb(db: Db | null): void {
  current = db
  pending = null
}

async function connect(): Promise<Db> {
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL
  if (url) {
    const { Pool } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-serverless')
    return drizzle({ client: new Pool({ connectionString: url }), schema }) as unknown as Db
  }
  // Nas Netlify Functions o disco é temporário: sem Postgres configurado os dados perder-se-iam.
  if (process.env.REQUIRE_DATABASE_URL === '1') {
    throw new Error('NETLIFY_DATABASE_URL (ou DATABASE_URL) não está definido. Active o Netlify DB ou indique um Postgres.')
  }
  return createPgliteDb(process.env.PGLITE_DIR)
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
