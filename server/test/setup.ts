import { afterEach, beforeAll, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createPgliteDb, setDb, type Db } from '../src/db/client'
import { setSleep } from '../src/microsoft/graph'
import { resetFetch } from './helpers'

Object.assign(process.env, {
  APP_ENV: 'testing',
  APP_KEY: Buffer.alloc(32, 7).toString('base64'),
  APP_URL: 'http://localhost',
  MICROSOFT_TENANT_ID: 'tenant-test',
  MICROSOFT_CLIENT_ID: 'client-test',
  MICROSOFT_CLIENT_SECRET: 'secret-test',
  MICROSOFT_REDIRECT_URI: 'http://localhost/auth/microsoft/callback',
  MICROSOFT_BOOTSTRAP_SUPER_ADMINS: '',
  AUTH_DEV_LOGIN: 'false',
})
delete process.env.NETLIFY_DATABASE_URL
delete process.env.DATABASE_URL
delete process.env.PGLITE_DIR

let db: Db

beforeAll(async () => {
  db = await createPgliteDb()
  setDb(db)
})

beforeEach(async () => {
  // Base limpa em cada teste (mais rápido do que recriar o PGlite).
  const rows = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)
  const tables = (rows as unknown as { rows: { tablename: string }[] }).rows.map((r) => `"${r.tablename}"`)
  if (tables.length) await db.execute(sql.raw(`truncate ${tables.join(', ')} restart identity cascade`))
  setSleep(async () => undefined)
  resetFetch()
})

afterEach(() => resetFetch())

export const testDb = () => db
