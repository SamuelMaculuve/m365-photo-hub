import '../src/netlify-env'
import { handle } from 'hono/netlify'
import { createApp } from '../src/app'


/** Toda a API (/api, /auth, /sanctum) numa só função; o SPA estático é servido pelo Netlify. */
export default handle(createApp())

export const config = {
  path: ['/api/*', '/auth/*', '/sanctum/*'],
}
