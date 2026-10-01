/**
 * Servidor de desenvolvimento (sem Netlify): mesma API em http://127.0.0.1:8000, com PGlite em .data/pglite.
 * O Vite (frontend) já faz proxy de /api, /auth e /sanctum para esta porta.
 */
import { serve } from '@hono/node-server'
import { createApp } from './app'

process.env.PGLITE_DIR ??= '.data/pglite'
const port = Number(process.env.PORT ?? 8000)
serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, () => console.log(`API em http://127.0.0.1:${port}`))
