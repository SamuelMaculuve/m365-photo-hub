import { handle } from 'hono/netlify'
import { createApp } from '../src/app'

// Em produção a base de dados tem de ser o Postgres do Netlify DB (o disco das funções é temporário).
process.env.REQUIRE_DATABASE_URL = '1'

/** Toda a API (/api, /auth, /sanctum) numa só função; o SPA estático é servido pelo Netlify. */
export default handle(createApp())

export const config = {
  path: ['/api/*', '/auth/*', '/sanctum/*'],
}
