/**
 * Aplica as migrações (server/drizzle) à base configurada:
 * - com DATABASE_URL, a esse Postgres (corre no build do Netlify);
 * - sem DATABASE_URL no Netlify (modo demonstração) não há nada a fazer: a base nasce em memória;
 * - localmente, ao PGlite em PGLITE_DIR (por omissão .data/pglite).
 */
import { createPgliteDb, migrationsDir } from './client'

if (process.env.DATABASE_URL) {
  const { Pool } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  const url = process.env.DATABASE_URL
  const pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } })
  await migrate(drizzle({ client: pool }), { migrationsFolder: migrationsDir() })
  await pool.end()
  console.log('Migrações aplicadas (Postgres).')
} else if (process.env.NETLIFY === 'true') {
  console.log('Sem DATABASE_URL: o site corre em modo demonstração (PGlite + Netlify Blobs). Nada a migrar.')
} else {
  await createPgliteDb(process.env.PGLITE_DIR ?? '.data/pglite')
  console.log('Migrações aplicadas (PGlite).')
}
process.exit(0)
