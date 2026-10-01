import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { cacheEntries } from '../db/schema'

/** Cache, locks e contadores partilhados entre invocações serverless, guardados na base de dados (substitui o Redis). */
export class Cache {
  constructor(private readonly db: Db) {}

  async get<T>(key: string): Promise<T | null> {
    const [row] = await this.db.select().from(cacheEntries)
      .where(and(eq(cacheEntries.key, key), or(isNull(cacheEntries.expiresAt), gt(cacheEntries.expiresAt, new Date()))))
    return row ? (row.value as T) : null
  }

  async put(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null
    await this.db.insert(cacheEntries).values({ key, value: value as object, expiresAt })
      .onConflictDoUpdate({ target: cacheEntries.key, set: { value: value as object, expiresAt } })
  }

  async forget(key: string): Promise<void> {
    await this.db.delete(cacheEntries).where(eq(cacheEntries.key, key))
  }

  async remember<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<{ v: T }>(key)
    if (hit) return hit.v
    const value = await fn()
    await this.put(key, { v: value }, ttlSeconds)
    return value
  }

  /** Lock exclusivo com expiração. Devolve true se foi obtido. */
  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    const k = `lock:${key}`
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    await this.db.delete(cacheEntries).where(and(eq(cacheEntries.key, k), lt(cacheEntries.expiresAt, new Date())))
    const rows = await this.db.insert(cacheEntries).values({ key: k, value: { at: Date.now() }, expiresAt })
      .onConflictDoNothing().returning({ key: cacheEntries.key })
    return rows.length > 0
  }

  async release(key: string): Promise<void> {
    await this.forget(`lock:${key}`)
  }

  /** Espera pelo lock (até waitMs) e executa fn; útil para renovações de tokens concorrentes. */
  async withLock<T>(key: string, ttlSeconds: number, waitMs: number, fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + waitMs
    while (!(await this.acquire(key, ttlSeconds))) {
      if (Date.now() > deadline) throw new Error(`Could not acquire lock ${key}`)
      await new Promise((r) => setTimeout(r, 200))
    }
    try {
      return await fn()
    } finally {
      await this.release(key)
    }
  }

  /** Contador de rate limit numa janela fixa. Devolve true se ainda está dentro do limite. */
  async hit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfter: number }> {
    const window = Math.floor(Date.now() / 1000 / windowSeconds)
    const k = `rate:${key}:${window}`
    const expiresAt = new Date((window + 1) * windowSeconds * 1000)
    const [row] = await this.db.insert(cacheEntries).values({ key: k, value: {}, counter: 1, expiresAt })
      .onConflictDoUpdate({ target: cacheEntries.key, set: { counter: sql`${cacheEntries.counter} + 1` } })
      .returning({ counter: cacheEntries.counter })
    const count = Number(row?.counter ?? 1)
    return { ok: count <= limit, retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)) }
  }

  async prune(): Promise<void> {
    await this.db.delete(cacheEntries).where(lt(cacheEntries.expiresAt, new Date()))
  }
}
