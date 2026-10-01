import { config } from '../config'
import type { Db } from '../db/client'
import { auditLogs } from '../db/schema'

const FORBIDDEN_KEYS = new Set(['password', 'token', 'access_token', 'refresh_token', 'secret', 'client_secret', 'code'])

function sanitise(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? sanitise(v as Record<string, unknown>) : v
  }
  return out
}

function anonymise(ip: string | null): string | null {
  if (!ip || !config.anonymiseIp) return ip
  return ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::` : ip.replace(/\.\d+$/, '.0')
}

export interface AuditEntry {
  action: string
  userId?: number | null
  subject?: { type: string; id: number } | null
  result?: 'success' | 'denied' | 'error'
  context?: Record<string, unknown>
  ip?: string | null
}

/** Registo de acções relevantes. Nunca regista tokens nem palavras-passe; nunca quebra o pedido. */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  try {
    const context = e.context ? sanitise(e.context) : null
    await db.insert(auditLogs).values({
      userId: e.userId ?? null,
      action: e.action,
      subjectType: e.subject?.type ?? null,
      subjectId: e.subject?.id ?? null,
      ip: anonymise(e.ip ?? null),
      result: e.result ?? 'success',
      context: context && Object.keys(context).length ? context : null,
    })
  } catch (err) {
    console.error('audit failed', err)
  }
}
