import { and, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import * as s from '../../db/schema'
import { GraphApiError } from '../../lib/errors'
import type { GraphTokenProvider } from '../../microsoft/auth'
import { OneDrive } from '../../microsoft/onedrive'
import { DriveAuth } from '../drive-auth'
import { detectMediaType, type MediaType } from '../media-type'
import { FolderTree, type Scope } from './folder-tree'
import { toMediaAttributes } from './mapper'
import { syncLog } from './log'

/** Campos derivados do conteúdo: se o conteúdo não mudou, um valor em falta não apaga o conhecido. */
const CONTENT_FIELDS = ['takenAt', 'width', 'height', 'durationMs', 'latitude', 'longitude', 'placeName', 'placeRegion', 'placeCountry', 'placeDistanceKm', 'locationSource', 'metadata'] as const

type MediaRow = typeof s.media.$inferInsert
export type SliceResult = 'done' | 'more'

/**
 * Sincroniza um drive com a base de dados através de delta queries, por partes (uma "fatia" por invocação):
 * - um cursor por drive (o delta só funciona na raiz em Business/SharePoint);
 * - identidade dos ficheiros = (drive_id, item_id): renomear/mover nunca cria duplicados;
 * - checkpoint (resume_link) e estado intermédio (sync_jobs.state) guardados a cada página;
 * - 410/resyncRequired => sincronização completa com marca-e-varre.
 */
export class SyncEngine {
  private tree!: FolderTree
  private job!: s.SyncJob
  private drive!: s.Drive
  private pending = new Map<string, { item: Record<string, unknown>; type: MediaType }>()
  private changedFolders = new Set<string>()
  private deletedFolders = new Set<string>()

  constructor(
    private readonly db: Db,
    private readonly oneDrive = new OneDrive(),
  ) {}

  /** Processa páginas até `deadline` (epoch ms). Devolve 'more' se ainda falta trabalho. */
  async runSlice(jobId: number, deadline: number): Promise<SliceResult> {
    const [job] = await this.db.select().from(s.syncJobs).where(eq(s.syncJobs.id, jobId))
    if (!job || job.status === 'completed' || job.status === 'failed') return 'done'
    const [drive] = await this.db.select().from(s.drives).where(eq(s.drives.id, job.driveId))
    if (!drive) return 'done'
    this.job = job
    this.drive = drive

    await this.db.insert(s.driveSyncStates).values({ driveId: drive.id }).onConflictDoNothing()
    let [state] = await this.db.select().from(s.driveSyncStates).where(eq(s.driveSyncStates.driveId, drive.id))

    if (job.status === 'queued') {
      const fullScan = job.type !== 'incremental' || !state.deltaLink
      Object.assign(this.job, {
        type: fullScan && job.type === 'incremental' ? 'initial' : job.type,
        status: 'running',
        startedAt: job.startedAt ?? new Date(),
        totalEstimate: job.totalEstimate ?? (fullScan && state.itemsSeen ? state.itemsSeen : null),
        state: { fullScan, pending: [], changedFolders: [], deletedFolders: [] },
      })
      await this.saveJob()
      ;[state] = await this.db.update(s.driveSyncStates)
        .set({ status: 'running', lastStartedAt: new Date(), lastError: null, ...(fullScan ? { resumeLink: null } : {}) })
        .where(eq(s.driveSyncStates.id, state.id)).returning()
    }

    const fullScan = this.job.state?.fullScan ?? true
    this.pending = new Map((this.job.state?.pending ?? []).map((p) => [String(p.item.id), p]))
    this.changedFolders = new Set(this.job.state?.changedFolders ?? [])
    this.deletedFolders = new Set(this.job.state?.deletedFolders ?? [])

    if (drive.driveType === 'demo') {
      await this.finish(state, null, fullScan)
      return 'done'
    }

    await this.loadTree()
    const auth = await new DriveAuth(this.db).forSync(drive)

    // Retomar o checkpoint, continuar a partir do último deltaLink, ou começar do zero.
    let link: string | null = state.resumeLink ?? (fullScan ? null : state.deltaLink)
    try {
      while (true) {
        const page = await this.oneDrive.deltaPage(drive.driveId, link, auth)
        await this.processPage(page.items)
        if (page.deltaLink) {
          await this.finish(state, page.deltaLink, fullScan)
          return 'done'
        }
        link = page.nextLink
        await this.checkpoint(state.id, link)
        if (!link) {
          await this.finish(state, null, fullScan)
          return 'done'
        }
        if (Date.now() >= deadline) return 'more'
      }
    } catch (e) {
      if (e instanceof GraphApiError && e.isResyncRequired && this.job.type !== 'full_resync') {
        // O mesmo job continua como sincronização completa na próxima fatia.
        await syncLog(this.db, this.job.id, 'warning', 'resync_required', 'Delta token expired; running a full resynchronisation.')
        await this.db.update(s.driveSyncStates).set({ deltaLink: null, resumeLink: null }).where(eq(s.driveSyncStates.id, state.id))
        Object.assign(this.job, { type: 'full_resync', processed: 0, totalEstimate: state.itemsSeen || null, state: { fullScan: true, pending: [], changedFolders: [], deletedFolders: [] } })
        await this.saveJob()
        return 'more'
      }
      throw e
    }
  }

  /** Marca o job como falhado (depois de esgotar as tentativas). */
  async fail(jobId: number, e: unknown): Promise<void> {
    const [job] = await this.db.update(s.syncJobs).set({ status: 'failed', finishedAt: new Date(), updatedAt: new Date() }).where(eq(s.syncJobs.id, jobId)).returning()
    if (!job) return
    const name = e instanceof Error ? e.constructor.name : 'Error'
    await this.db.update(s.driveSyncStates).set({ status: 'failed', lastError: `${name}: ${String((e as Error)?.message ?? e)}`.slice(0, 1000) }).where(eq(s.driveSyncStates.driveId, job.driveId))
    await syncLog(this.db, jobId, 'error', 'sync_failed', `Synchronisation failed: ${name}`, null, {
      graph_status: e instanceof GraphApiError ? e.graphStatus : null,
      graph_code: e instanceof GraphApiError ? e.graphCode : null,
    })
  }

  private async processPage(items: Record<string, any>[]): Promise<void> {
    const files: Record<string, any>[] = []
    const folderRows: (typeof s.driveFolders.$inferInsert)[] = []
    // Pastas primeiro: um ficheiro pode chegar na mesma página que a sua pasta-mãe.
    for (const item of items) {
      if (item.deleted) await this.handleDeleted(item)
      else if (item.folder || item.root) folderRows.push(this.handleFolder(item))
      else if (item.file) files.push(item)
    }
    for (let i = 0; i < folderRows.length; i += 500) {
      await this.db.insert(s.driveFolders).values(folderRows.slice(i, i + 500)).onConflictDoUpdate({
        target: [s.driveFolders.driveId, s.driveFolders.itemId],
        set: { parentItemId: sql`excluded.parent_item_id`, name: sql`excluded.name`, isRoot: sql`excluded.is_root`, isDeleted: sql`excluded.is_deleted`, updatedAt: new Date() },
      })
    }

    const rows: MediaRow[] = []
    for (const item of files) {
      const type = detectMediaType(item.name ?? '', item.file?.mimeType)
      if (!type) continue
      const scope = this.tree.resolve(item.parentReference?.id)
      if (scope === null) {
        this.pending.set(String(item.id), { item, type })
        continue
      }
      rows.push(this.row(item, type, scope))
    }
    await this.upsertMedia(rows)
    this.job.processed += items.length
  }

  private handleFolder(item: Record<string, any>): typeof s.driveFolders.$inferInsert {
    const isRoot = Boolean(item.root)
    const parent = isRoot ? null : ((item.parentReference?.id as string | undefined) ?? null)
    const name = isRoot ? '' : String(item.name ?? '')
    if (this.tree.upsert(item.id, parent, name, isRoot)) this.changedFolders.add(item.id)
    this.deletedFolders.delete(item.id)
    return { driveId: this.drive.id, itemId: item.id, parentItemId: parent, name: name.slice(0, 400), isRoot, isDeleted: false }
  }

  private async handleDeleted(item: Record<string, any>): Promise<void> {
    const id = String(item.id)
    this.pending.delete(id)
    if (this.tree.has(id)) {
      this.tree.markDeleted(id)
      this.deletedFolders.add(id)
      await this.db.update(s.driveFolders).set({ isDeleted: true }).where(and(eq(s.driveFolders.driveId, this.drive.id), eq(s.driveFolders.itemId, id)))
      return
    }
    const removed = await this.db.update(s.media).set({ sourceState: 'removed_at_source', updatedAt: new Date() })
      .where(and(eq(s.media.driveId, this.drive.id), eq(s.media.itemId, id), eq(s.media.sourceState, 'active'))).returning({ id: s.media.id })
    this.job.removed += removed.length
  }

  private row(item: Record<string, any>, type: MediaType, scope: Scope): MediaRow {
    return {
      ...toMediaAttributes(item, type),
      driveId: this.drive.id,
      libraryId: scope.library,
      folderPath: scope.path.slice(0, 1024),
      sourceState: scope.library ? 'active' : 'out_of_scope',
      lastSeenSyncJobId: this.job.id,
      updatedAt: new Date(),
    }
  }

  private async upsertMedia(rows: MediaRow[]): Promise<void> {
    if (!rows.length) return
    // O mesmo item pode aparecer duas vezes no mesmo lote (ex.: pendente + página nova): fica o mais recente.
    rows = [...new Map(rows.map((r) => [r.itemId, r])).values()]

    const existing = new Map((await this.db.select().from(s.media)
      .where(and(eq(s.media.driveId, this.drive.id), inArray(s.media.itemId, rows.map((r) => r.itemId))))).map((m) => [m.itemId, m]))

    for (const row of rows) {
      const old = existing.get(row.itemId)
      row.metadataExtracted = false
      if (!old) {
        this.job.created++
        continue
      }
      this.job.updated++
      if (old.ctag !== row.ctag) continue // conteúdo novo: as miniaturas em cache usam o ctag na chave
      // Mesmo conteúdo (renomear/mover): preservar metadados já conhecidos.
      row.metadataExtracted = old.metadataExtracted
      for (const field of CONTENT_FIELDS) {
        if ((row as Record<string, unknown>)[field] == null && old[field] != null) (row as Record<string, unknown>)[field] = old[field]
      }
      // Localização manual ou estimada não é apagada por uma sincronização sem GPS.
      if (row.latitude == null && old.locationSource && old.locationSource !== 'graph') {
        Object.assign(row, { placeName: old.placeName, placeRegion: old.placeRegion, locationSource: old.locationSource })
      }
      if (row.takenAt) row.sortAt = row.takenAt
    }

    const columns = Object.keys(rows[0]).filter((k) => !['driveId', 'itemId', 'createdAt'].includes(k)) as (keyof MediaRow)[]
    const cols = s.media as unknown as Record<string, { name: string }>
    const set = Object.fromEntries(columns.map((k) => [k, sql.raw(`excluded."${cols[k].name}"`)]))
    for (let i = 0; i < rows.length; i += 200) {
      await this.db.insert(s.media).values(rows.slice(i, i + 200)).onConflictDoUpdate({ target: [s.media.driveId, s.media.itemId], set })
    }
  }

  private async checkpoint(stateId: number, link: string | null): Promise<void> {
    await this.db.update(s.driveSyncStates).set({ resumeLink: link, updatedAt: new Date() }).where(eq(s.driveSyncStates.id, stateId))
    await this.saveJob()
  }

  private async saveJob(): Promise<void> {
    this.job.state = {
      fullScan: this.job.state?.fullScan ?? true,
      pending: [...this.pending.values()],
      changedFolders: [...this.changedFolders],
      deletedFolders: [...this.deletedFolders],
    }
    const { id, ...values } = this.job
    await this.db.update(s.syncJobs).set({ ...values, updatedAt: new Date() }).where(eq(s.syncJobs.id, id))
  }

  private async finish(state: s.DriveSyncState, deltaLink: string | null, fullScan: boolean): Promise<void> {
    if (this.drive.driveType !== 'demo') {
      await this.flushPending()
      await this.applyFolderChanges()
      if (fullScan) await this.sweep()
    }
    await this.db.update(s.driveSyncStates).set({
      deltaLink: deltaLink ?? state.deltaLink,
      resumeLink: null,
      status: 'idle',
      lastCompletedAt: new Date(),
      itemsSeen: fullScan ? this.job.processed : state.itemsSeen,
      updatedAt: new Date(),
    }).where(eq(s.driveSyncStates.id, state.id))
    this.pending.clear()
    this.changedFolders.clear()
    this.deletedFolders.clear()
    Object.assign(this.job, { status: 'completed', finishedAt: new Date() })
    await this.saveJob()
    this.job.state = null
    await this.db.update(s.syncJobs).set({ state: null }).where(eq(s.syncJobs.id, this.job.id))
  }

  /** Ficheiros cuja pasta-mãe chegou depois deles, ou que ficaram sem ascendência conhecida. */
  private async flushPending(): Promise<void> {
    const rows = [...this.pending.values()].map((p) =>
      this.row(p.item, p.type, this.tree.resolve((p.item.parentReference as { id?: string } | undefined)?.id) ?? { library: null, path: '/', deleted: false }),
    )
    this.pending.clear()
    await this.upsertMedia(rows)
  }

  /**
   * Pastas movidas/renomeadas/eliminadas: recalcular caminho, biblioteca e estado
   * de todos os ficheiros da sub-árvore (inclui mover para dentro/fora do âmbito).
   */
  private async applyFolderChanges(): Promise<void> {
    for (const folderId of this.tree.subtree([...this.changedFolders, ...this.deletedFolders])) {
      const scope = this.tree.resolve(folderId)
      const where = and(eq(s.media.driveId, this.drive.id), eq(s.media.parentItemId, folderId))
      if (!scope || scope.library === null) {
        const state = !scope || scope.deleted ? 'removed_at_source' : 'out_of_scope'
        const rows = await this.db.update(s.media).set({ sourceState: state, libraryId: null, updatedAt: new Date() })
          .where(and(where, eq(s.media.sourceState, 'active'))).returning({ id: s.media.id })
        this.job.removed += rows.length
        continue
      }
      // Inclui itens marcados como removidos: uma pasta restaurada da Reciclagem volta a trazê-los.
      await this.db.update(s.media).set({ libraryId: scope.library, folderPath: scope.path.slice(0, 1024), sourceState: 'active', updatedAt: new Date() }).where(where)
    }
  }

  /** Sincronização completa: o que não foi visto deixou de existir na origem. */
  private async sweep(): Promise<void> {
    const rows = await this.db.update(s.media).set({ sourceState: 'removed_at_source', updatedAt: new Date() }).where(and(
      eq(s.media.driveId, this.drive.id),
      eq(s.media.sourceState, 'active'),
      or(isNull(s.media.lastSeenSyncJobId), ne(s.media.lastSeenSyncJobId, this.job.id)),
    )).returning({ id: s.media.id })
    this.job.removed += rows.length
  }

  private async loadTree(): Promise<void> {
    const roots = await this.db.select({ rootItemId: s.libraryRoots.rootItemId, libraryId: s.libraryRoots.libraryId }).from(s.libraryRoots).where(eq(s.libraryRoots.driveId, this.drive.id))
    this.tree = new FolderTree(new Map(roots.map((r) => [r.rootItemId, r.libraryId])))
    const folders = await this.db.select({ itemId: s.driveFolders.itemId, parentItemId: s.driveFolders.parentItemId, name: s.driveFolders.name, isRoot: s.driveFolders.isRoot, isDeleted: s.driveFolders.isDeleted })
      .from(s.driveFolders).where(eq(s.driveFolders.driveId, this.drive.id))
    for (const f of folders) this.tree.load(f.itemId, f.parentItemId, f.name, f.isRoot, f.isDeleted)
  }
}

export type { GraphTokenProvider }
