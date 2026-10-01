/** Aplica as migrações à base configurada. Corre no build do Netlify (npm run db:migrate). */
import { databaseUrl, migrateDb, open } from './client'

if (process.env.NETLIFY === 'true' && !process.env.TURSO_DATABASE_URL) {
  throw new Error('TURSO_DATABASE_URL não está definido: configure as variáveis do Turso antes do deploy.')
}
const { url, authToken, remote } = databaseUrl()
await migrateDb(await open(url, authToken))
console.log(`Migrações aplicadas (${remote ? 'Turso' : url}).`)
