/**
 * Marcador da próxima sincronização, guardado no Netlify Blobs (não na base de dados).
 * A função agendada lê-o primeiro: se ainda não é hora e não há trabalho pendente, termina
 * sem carregar a base (no modo demonstração, arrancar o PGlite e descarregar a cópia do Blobs).
 */
export interface ScheduleState {
  /** Epoch ms a partir do qual há sincronizações a agendar. */
  nextDueAt: number
  /** Ficou trabalho por fazer na última passagem. */
  pending: boolean
}

const KEY = 'sync-schedule'

async function store() {
  const { getStore } = await import('@netlify/blobs')
  return getStore({ name: 'app-state', consistency: 'strong' })
}

export async function readScheduleState(): Promise<ScheduleState | null> {
  try {
    return ((await (await store()).get(KEY, { type: 'json' })) as ScheduleState | null) ?? null
  } catch (e) {
    console.error('schedule state read failed', e)
    return null // na dúvida, trabalhar
  }
}

export async function writeScheduleState(state: ScheduleState): Promise<void> {
  try {
    await (await store()).setJSON(KEY, state)
  } catch (e) {
    console.error('schedule state write failed', e)
  }
}

/** Marca trabalho pendente (ex.: um administrador pediu uma sincronização). */
export async function markSyncPending(): Promise<void> {
  const current = await readScheduleState()
  await writeScheduleState({ nextDueAt: current?.nextDueAt ?? 0, pending: true })
}
