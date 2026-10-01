import type { Db } from '../../db/client'
import { syncLogs } from '../../db/schema'

export async function syncLog(db: Db, jobId: number | null, level: 'info' | 'warning' | 'error', code: string, message: string, itemId: string | null = null, context: Record<string, unknown> = {}) {
  await db.insert(syncLogs).values({
    syncJobId: jobId, level, code, message: message.slice(0, 1000), itemId, context: Object.keys(context).length ? context : null,
  })
  if (level === 'error') console.error(message, { sync_job_id: jobId, code, item_id: itemId, ...context })
}
