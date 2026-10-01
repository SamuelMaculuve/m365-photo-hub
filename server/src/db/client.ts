import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type Db = LibSQLDatabase<typeof schema>

/** Calculado só quando é preciso (no bundle das funções não há migrações em tempo de execução). */
export const migrationsDir = () => fileURLToPath(new URL('../../drizzle', import.meta.url))

let current: Db | null = null
let pending: Promise<Db> | null = null

/**
 * Base de dados da aplicação (SQLite/libSQL):
 * - produção (Netlify): Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN);
 * - desenvolvimento: ficheiro local (SQLITE_FILE, por omissão .data/app.db);
 * - testes: memória.
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

export function databaseUrl(): { url: string; authToken?: string; remote: boolean } {
  const remote = process.env.TURSO_DATABASE_URL
  if (remote) return { url: remote, authToken: process.env.TURSO_AUTH_TOKEN, remote: true }
  // Nas Netlify Functions o disco é temporário: sem Turso configurado os dados perder-se-iam.
  if (process.env.REQUIRE_DATABASE_URL === '1') {
    throw new Error('TURSO_DATABASE_URL não está definido. Crie a base no Turso e configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.')
  }
  const file = process.env.SQLITE_FILE ?? '.data/app.db'
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
  return { url: file === ':memory:' ? ':memory:' : `file:${file}`, remote: false }
}

async function connect(): Promise<Db> {
  const { url, authToken, remote } = databaseUrl()
  const db = await open(url, authToken)
  // Remotamente as migrações correm no build; localmente aplicam-se ao abrir.
  if (!remote) await migrateDb(db)
  return db
}

export async function open(url: string, authToken?: string): Promise<Db> {
  const remote = url.startsWith('libsql:') || url.startsWith('https:') || url.startsWith('wss:')
  if (remote) {
    // Cliente só HTTP (sem binário nativo): é o que entra no bundle das Netlify Functions.
    const { createClient } = await import('@libsql/client/web')
    const { drizzle } = await import('drizzle-orm/libsql/web')
    return drizzle(createClient({ url, authToken }), { schema }) as unknown as Db
  }
  // Ficheiro local ou memória: cliente nativo. O nome numa variável impede o bundler de o incluir.
  const nodeClient = '@libsql/client'
  const nodeDriver = 'drizzle-orm/libsql'
  const { createClient } = (await import(nodeClient)) as typeof import('@libsql/client')
  const { drizzle } = (await import(nodeDriver)) as typeof import('drizzle-orm/libsql')
  const client = createClient({ url, authToken })
  // Várias leituras em paralelo com uma escrita (como no Turso).
  if (url !== ':memory:') await client.execute('PRAGMA journal_mode = WAL').catch(() => undefined)
  await client.execute('PRAGMA busy_timeout = 5000')
  await client.execute('PRAGMA foreign_keys = ON')
  return drizzle(client, { schema })
}

export async function migrateDb(db: Db): Promise<void> {
  const { migrate } = await import('drizzle-orm/libsql/migrator')
  await migrate(db, { migrationsFolder: migrationsDir() })
}

/** Base nova em memória com as migrações aplicadas (testes). */
export async function createMemoryDb(): Promise<Db> {
  const db = await open(':memory:')
  await migrateDb(db)
  return db
}
