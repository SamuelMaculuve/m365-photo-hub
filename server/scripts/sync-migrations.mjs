/**
 * Copia as migrações SQL geradas pelo drizzle-kit (server/drizzle) para netlify/database/migrations,
 * a pasta que o Netlify Database aplica automaticamente em cada deploy (por ordem do nome).
 * Corre depois de "drizzle-kit generate" (npm run db:generate).
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const from = join(root, 'drizzle')
const to = join(root, '..', 'netlify', 'database', 'migrations')
mkdirSync(to, { recursive: true })
const files = readdirSync(from).filter((f) => /^\d+_[a-z0-9_-]+\.sql$/.test(f)).sort()
for (const f of files) copyFileSync(join(from, f), join(to, f))
console.log(`${files.length} migração(ões) em netlify/database/migrations`)
