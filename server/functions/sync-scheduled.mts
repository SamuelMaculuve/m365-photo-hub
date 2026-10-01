import type { Config } from '@netlify/functions'
import { getDb } from '../src/db/client'
import { config as appConfig } from '../src/config'
import { SyncManager } from '../src/services/sync/manager'
import { kickSync } from '../src/services/sync/trigger'

process.env.REQUIRE_DATABASE_URL = '1'

/**
 * Agendada (a cada 5 min): cria sincronizações incrementais para os drives em atraso e processa
 * uma fatia. Se ficar trabalho por fazer, passa-o à Background Function (até 15 min).
 */
export default async () => {
  const manager = new SyncManager(await getDb())
  await manager.dispatchDue()
  const more = await manager.work(Date.now() + appConfig.sync.sliceSeconds * 1000)
  if (more) await kickSync()
  if (new Date().getUTCMinutes() < 5) await manager.prune() // uma vez por hora
}

export const config: Config = { schedule: '*/5 * * * *' }
