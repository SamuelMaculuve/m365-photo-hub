import type { Context } from '@netlify/functions'
import { getDb } from '../src/db/client'
import { safeEqual } from '../src/lib/crypto'
import { SyncManager } from '../src/services/sync/manager'
import { syncSecret } from '../src/services/sync/trigger'

process.env.REQUIRE_DATABASE_URL = '1'

/**
 * Background Function (sufixo "-background": o Netlify responde 202 e deixa-a correr até 15 min).
 * Processa a fila de sincronização por fatias; o checkpoint permite continuar noutra invocação.
 */
export default async (req: Request, _context: Context) => {
  if (!safeEqual(req.headers.get('x-sync-secret') ?? '', syncSecret())) return new Response(null, { status: 403 })
  const manager = new SyncManager(await getDb())
  const deadline = Date.now() + 13 * 60_000
  while (Date.now() < deadline) {
    const started = Date.now()
    if (!(await manager.work(Math.min(deadline, started + 60_000)))) break
    // Os jobs restantes estão bloqueados por outra invocação: esperar em vez de consultar sem parar.
    if (Date.now() - started < 1000) await new Promise((r) => setTimeout(r, 5000))
  }
  return new Response(null, { status: 202 })
}
