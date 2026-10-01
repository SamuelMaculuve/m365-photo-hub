/** Aplica as migrações à base de dados configurada. Corre no build do Netlify (npm run db:migrate). */
import { createPgliteDb, migrationsDir } from './client'

const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL
if (url) {
  const { Pool } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-serverless')
  const { migrate } = await import('drizzle-orm/neon-serverless/migrator')
  const pool = new Pool({ connectionString: url })
  await migrate(drizzle({ client: pool }), { migrationsFolder: migrationsDir() })
  await pool.end()
  console.log('Migrações aplicadas (Postgres).')
} else if (process.env.NETLIFY === 'true') {
  throw new Error('NETLIFY_DATABASE_URL não está definido: active o Netlify DB (npx netlify db init) antes do deploy.')
} else {
  await createPgliteDb(process.env.PGLITE_DIR ?? '.data/pglite')
  console.log('Migrações aplicadas (PGlite).')
}
