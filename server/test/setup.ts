import { afterEach, beforeEach } from 'vitest'
import { createMemoryDb, setDb, type Db } from '../src/db/client'
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
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
process.env.SQLITE_FILE = ':memory:'

let db: Db

beforeEach(async () => {
  // Base nova em memória em cada teste (SQLite cria-a e migra-a em milissegundos).
  db = await createMemoryDb()
  setDb(db)
  setSleep(async () => undefined)
  resetFetch()
})

afterEach(() => resetFetch())

export const testDb = () => db
