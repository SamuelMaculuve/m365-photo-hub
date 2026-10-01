import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import { config } from '../../config'
import type { Db } from '../../db/client'
import * as s from '../../db/schema'
import { Cache } from '../../lib/cache'
import { conflict } from '../../lib/errors'
import { SyncEngine } from './engine'
import { syncLog } from './log'

/** Um job sem progresso há mais do que isto é considerado abandonado. */
const STALE_AFTER_MINUTES = 90
/** Falhas reais toleradas por job; entre tentativas retoma do último checkpoint. */
const MAX_ATTEMPTS = 3

export type SyncType = 'initial' | 'incremental' | 'full_resync'

/**
 * Ponto de entrada das sincronizações. Nunca correm dentro de um pedido HTTP: os jobs ficam
 * em fila (sync_jobs) e são processados por fatias pela função agendada e pela função em segundo plano.
 */
export class SyncManager {
  private readonly cache: Cache

  constructor(private readonly db: Db) {
    this.cache = new Cache(db)
  }

  async start(drive: s.Drive, type: SyncType, by: number | null = null, libraryId: number | null = null): Promise<s.SyncJob> {
    const active = await this.activeJob(drive.id)
    if (active) throw conflict('Sync already running', { sync_job_id: active.id }, 'errors.sync_running')
    const [job] = await this.db.insert(s.syncJobs).values({ driveId: drive.id, libraryId, type, status: 'queued', triggeredBy: by }).returning()
    return job
  }

  async startForLibrary(libraryId: number, full: boolean, by: number | null = null): Promise<s.SyncJob[]> {
    const rows = await this.db.selectDistinct({ drive: s.drives, state: s.driveSyncStates }).from(s.libraryRoots)
      .innerJoin(s.drives, eq(s.drives.id, s.libraryRoots.driveId))
      .leftJoin(s.driveSyncStates, eq(s.driveSyncStates.driveId, s.drives.id))
      .where(eq(s.libraryRoots.libraryId, libraryId))
    const jobs: s.SyncJob[] = []
    for (const { drive, state } of rows) {
      const type: SyncType = full ? 'full_resync' : state?.deltaLink ? 'incremental' : 'initial'
      jobs.push((await this.activeJob(drive.id)) ?? (await this.start(drive, type, by, libraryId)))
    }
    return jobs
  }

  /** Chamado pelo agendamento: uma sincronização incremental para cada drive com bibliotecas activas. */
  async dispatchDue(): Promise<number> {
    const interval = config.sync.intervalMinutes
    const rows = await this.db.selectDistinct({ drive: s.drives, state: s.driveSyncStates }).from(s.drives)
      .innerJoin(s.libraryRoots, eq(s.libraryRoots.driveId, s.drives.id))
      .innerJoin(s.libraries, and(eq(s.libraries.id, s.libraryRoots.libraryId), eq(s.libraries.enabled, true), isNull(s.libraries.deletedAt)))
      .leftJoin(s.driveSyncStates, eq(s.driveSyncStates.driveId, s.drives.id))
      .where(ne(s.drives.driveType, 'demo'))
    let count = 0
    for (const { drive, state } of rows) {
      const last = state?.lastCompletedAt
      if ((await this.activeJob(drive.id)) || (last && last.getTime() > Date.now() - (interval - 1) * 60_000)) continue
      await this.start(drive, state?.deltaLink ? 'incremental' : 'initial')
      count++
    }
    return count
  }

  async activeJob(driveId: number): Promise<s.SyncJob | null> {
    const [job] = await this.db.select().from(s.syncJobs)
      .where(and(eq(s.syncJobs.driveId, driveId), inArray(s.syncJobs.status, ['queued', 'running'])))
      .orderBy(desc(s.syncJobs.id)).limit(1)
    if (job && job.updatedAt.getTime() < Date.now() - STALE_AFTER_MINUTES * 60_000) {
      await this.db.update(s.syncJobs).set({ status: 'failed', finishedAt: new Date() }).where(eq(s.syncJobs.id, job.id))
      await syncLog(this.db, job.id, 'warning', 'stale_job', 'Sync job abandoned (no progress); marked as failed.')
      return null
    }
    return job ?? null
  }

  /**
   * Processa jobs em fila até `deadline` (epoch ms). Cada drive tem um lock: duas invocações
   * concorrentes (agendada e em segundo plano) nunca trabalham no mesmo drive.
   * Devolve true se ainda ficou trabalho por fazer.
   */
  async work(deadline: number): Promise<boolean> {
    const engine = new SyncEngine(this.db)
    const skipped = new Set<number>()
    // Pelo menos uma fatia por invocação, mesmo com pouco tempo: garante progresso.
    for (let first = true; first || Date.now() < deadline; first = false) {
      const jobs = await this.db.select().from(s.syncJobs).where(inArray(s.syncJobs.status, ['queued', 'running'])).orderBy(asc(s.syncJobs.id))
      const job = jobs.find((j) => !skipped.has(j.id))
      if (!job) return jobs.length > 0
      const lock = `drive-sync:${job.driveId}`
      // O lock dura mais do que uma fatia; se a invocação morrer, expira sozinho.
      if (!(await this.cache.acquire(lock, config.sync.sliceSeconds + 120))) {
        skipped.add(job.id)
        continue
      }
      try {
        const result = await engine.runSlice(job.id, deadline)
        if (result === 'more' && Date.now() >= deadline) return true
        skipped.delete(job.id)
      } catch (e) {
        const attempts = job.attempts + 1
        await this.db.update(s.syncJobs).set({ attempts, updatedAt: new Date() }).where(eq(s.syncJobs.id, job.id))
        if (attempts >= MAX_ATTEMPTS) await engine.fail(job.id, e)
        else await syncLog(this.db, job.id, 'warning', 'slice_failed', `Sync slice failed (attempt ${attempts}); will resume from checkpoint.`)
        skipped.add(job.id)
      } finally {
        await this.cache.release(lock)
      }
    }
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)` }).from(s.syncJobs).where(inArray(s.syncJobs.status, ['queued', 'running']))
    return n > 0
  }

  /** Limpeza periódica: logs antigos e cache expirada. */
  async prune(): Promise<void> {
    await this.cache.prune()
    await this.db.delete(s.syncLogs).where(lt(s.syncLogs.createdAt, new Date(Date.now() - 90 * 86_400_000)))
  }
}
