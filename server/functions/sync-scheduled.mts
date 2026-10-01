import '../src/netlify-env'
import type { Config } from '@netlify/functions'
import { ensureDatabase, persistDatabase } from '../src/db/client'
import { config as appConfig } from '../src/config'
import { SyncManager } from '../src/services/sync/manager'
import { readScheduleState, writeScheduleState } from '../src/services/sync/schedule-state'
import { kickSync } from '../src/services/sync/trigger'

/**
 * Agendada (de hora a hora). Sai logo, sem tocar na base, se não houver sincronização em atraso
 * (marcador no Netlify Blobs). Quando há, agenda as incrementais, processa uma fatia e, se ficar
 * trabalho, passa-o à Background Function.
 */
export default async () => {
  const state = await readScheduleState()
  if (state && !state.pending && Date.now() < state.nextDueAt) return

  const manager = new SyncManager(await ensureDatabase())
  await manager.dispatchDue()
  const more = await manager.work(Date.now() + appConfig.sync.sliceSeconds * 1000)
  await manager.prune()
  await persistDatabase() // modo demonstração: gravar a cópia da base
  await writeScheduleState({ nextDueAt: Date.now() + appConfig.sync.intervalMinutes * 60_000, pending: more })
  if (more) await kickSync()
}

export const config: Config = { schedule: '@hourly' }
