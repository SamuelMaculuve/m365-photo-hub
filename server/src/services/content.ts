import { eq } from 'drizzle-orm'
import { config } from '../config'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { thumbnailStore } from '../lib/blobs'
import { Cache } from '../lib/cache'
import { sha256 } from '../lib/crypto'
import { GraphApiError, GraphThrottleError, mediaUnavailable } from '../lib/errors'
import { GraphAuth } from '../microsoft/auth'
import { OneDrive } from '../microsoft/onedrive'
import { DriveAuth } from './drive-auth'

/**
 * Obtém conteúdo (miniaturas, URLs de download) a partir do Microsoft 365.
 * A autorização da aplicação é SEMPRE verificada antes de chamar este serviço.
 */
export class MediaContent {
  private readonly oneDrive = new OneDrive()

  constructor(private readonly db: Db) {}

  private async drive(m: s.Media): Promise<s.Drive> {
    const [d] = await this.db.select().from(s.drives).where(eq(s.drives.id, m.driveId))
    return d
  }

  /** Miniatura em cache (Netlify Blobs) ou pedida ao Graph. A chave inclui o eTag: um ficheiro alterado gera outra. */
  async thumbnail(m: s.Media, size: string, viewer: s.User | null): Promise<{ data: ArrayBuffer; mime: string }> {
    const key = `${m.id}/${size}/${sha256(m.etag ?? String(m.sourceModifiedAt?.getTime() ?? '')).slice(0, 12)}`
    const store = thumbnailStore()
    const cached = await store.get(key).catch(() => null)
    if (cached) return cached

    const drive = await this.drive(m)
    const result = await this.guard(m, async () => {
      const t = await this.oneDrive.thumbnail(drive.driveId, m.itemId, config.thumbnailSizes[size], new DriveAuth(this.db).forContent(drive, viewer))
      return { data: t.body, mime: t.mime }
    })
    await store.set(key, result.data, result.mime).catch((e) => console.error('thumbnail cache write failed', e))
    return result
  }

  /** URL temporário para o original (vídeo em streaming ou download). */
  async downloadUrl(m: s.Media, viewer: s.User | null): Promise<string> {
    const drive = await this.drive(m)
    const auth = new DriveAuth(this.db).forContent(drive, viewer)
    return new Cache(this.db).remember(`dl:${m.id}:${m.etag}:${auth.identity()}`, config.downloadUrlTtl, () =>
      this.guard(m, () => this.oneDrive.downloadUrl(drive.driveId, m.itemId, auth)),
    )
  }

  /**
   * Envia o ficheiro para a Reciclagem do Microsoft 365 com o token DO PRÓPRIO utilizador,
   * para que o SharePoint verifique se ele tem permissão de eliminação.
   */
  async moveToRecycleBin(m: s.Media, user: s.User): Promise<void> {
    const drive = await this.drive(m)
    await this.oneDrive.moveToRecycleBin(drive.driveId, m.itemId, new GraphAuth(this.db).forUser(user))
  }

  /** "Ficheiro não encontrado / sem acesso" → erro amigável. Se o ficheiro deixou de existir, o item é marcado como removido. */
  private async guard<T>(m: s.Media, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof GraphThrottleError) throw e
      if (e instanceof GraphApiError && (e.isNotFound || e.isForbidden)) {
        if (e.isNotFound) await this.verify(m)
        throw mediaUnavailable('Media not retrievable', { media_id: m.id })
      }
      throw e
    }
  }

  /** Confirma no Graph se o item ainda existe (uma miniatura em falta não significa ficheiro apagado). */
  private async verify(m: s.Media): Promise<void> {
    try {
      const drive = await this.drive(m)
      await this.oneDrive.getItem(drive.driveId, m.itemId, await new DriveAuth(this.db).forSync(drive))
    } catch (e) {
      if (e instanceof GraphApiError && e.isNotFound) {
        await this.db.update(s.media).set({ sourceState: 'removed_at_source', updatedAt: new Date() }).where(eq(s.media.id, m.id))
      }
    }
  }
}
