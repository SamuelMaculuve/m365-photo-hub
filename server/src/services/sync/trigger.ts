import { config } from '../../config'
import { getDb } from '../../db/client'
import { hmac } from '../../lib/crypto'
import { SyncManager } from './manager'
import { markSyncPending } from './schedule-state'

export const syncSecret = () => hmac('sync-background')

/**
 * Pede o processamento imediato da fila de sincronização, sem esperar pela função agendada:
 * - no Netlify invoca a Background Function (até 15 min por invocação);
 * - no servidor de desenvolvimento trabalha no próprio processo, sem bloquear o pedido.
 */
export async function kickSync(): Promise<void> {
  if (process.env.APP_ENV === 'testing') return
  const site = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (process.env.NETLIFY_FUNCTION || process.env.NETLIFY_DEV) {
    // Mesmo que a invocação falhe, a função agendada apanha o trabalho na próxima hora.
    await markSyncPending()
    if (!site) return
    await fetch(`${site}/.netlify/functions/sync-background`, { method: 'POST', headers: { 'x-sync-secret': syncSecret() } }).catch((e) => console.error('kickSync failed', e))
    return
  }
  void (async () => {
    const manager = new SyncManager(await getDb())
    while (await manager.work(Date.now() + config.sync.sliceSeconds * 1000));
  })().catch((e) => console.error('local sync failed', e))
}
