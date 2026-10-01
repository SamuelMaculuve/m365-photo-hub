import { config } from '../config'
import type { Db } from '../db/client'
import { settings } from '../db/schema'

export async function allSettings(db: Db): Promise<Record<string, unknown>> {
  const rows = await db.select().from(settings)
  const stored = Object.fromEntries(rows.filter((r) => r.key in config.settingsDefaults).map((r) => [r.key, r.value]))
  return { ...config.settingsDefaults, ...stored }
}

export async function getSetting<T = unknown>(db: Db, key: string): Promise<T> {
  return (await allSettings(db))[key] as T
}

export async function updateSettings(db: Db, values: Record<string, unknown>, by: number | null): Promise<Record<string, unknown>> {
  for (const [key, value] of Object.entries(values)) {
    if (!(key in config.settingsDefaults)) continue
    await db.insert(settings).values({ key, value: value as object, updatedBy: by })
      .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedBy: by, updatedAt: new Date() } })
  }
  return allSettings(db)
}
