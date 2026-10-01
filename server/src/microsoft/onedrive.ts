import { config } from '../config'
import { GraphApiError } from '../lib/errors'
import type { GraphTokenProvider } from './auth'
import { enc, GraphClient, itemPath } from './graph'

const ITEM_SELECT = 'id,name,parentReference,folder,file,root,size,webUrl,eTag,cTag,fileSystemInfo'

export interface DeltaPage {
  items: Record<string, any>[]
  nextLink: string | null
  deltaLink: string | null
}

/** Operações sobre drives e driveItems (OneDrive e bibliotecas de documentos SharePoint). */
export class OneDrive {
  constructor(private readonly graph = new GraphClient()) {}

  getDrive(driveId: string, auth: GraphTokenProvider) {
    return this.graph.get(`/drives/${enc(driveId)}`, auth, { $select: 'id,name,driveType,webUrl,owner,quota' })
  }

  getItem(driveId: string, itemId: string, auth: GraphTokenProvider) {
    return this.graph.get(itemPath(driveId, itemId), auth, { $select: ITEM_SELECT })
  }

  getRoot(driveId: string, auth: GraphTokenProvider) {
    return this.graph.get(`/drives/${enc(driveId)}/root`, auth, { $select: ITEM_SELECT })
  }

  /** Sub-pastas de uma pasta (navegador de pastas do administrador). */
  async listFolders(driveId: string, itemId: string | null, auth: GraphTokenProvider, limit = 500) {
    const path = itemId && itemId !== 'root' ? `${itemPath(driveId, itemId)}/children` : `/drives/${enc(driveId)}/root/children`
    const folders: { id: string; name: string; child_count: number; path: string | null }[] = []
    for await (const item of this.graph.paginate(path, auth, { $select: 'id,name,folder,parentReference', $top: 200 }, limit)) {
      if (item.folder) folders.push({ id: item.id, name: item.name, child_count: Number(item.folder.childCount ?? 0), path: item.parentReference?.path ?? null })
    }
    return folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  }

  /**
   * Uma página da delta query na raiz do drive. No OneDrive for Business/SharePoint o delta
   * só é suportado na raiz — o filtro por pasta é feito pela aplicação.
   * `link` = nextLink/deltaLink guardado (null = sincronização inicial).
   */
  async deltaPage(driveId: string, link: string | null, auth: GraphTokenProvider): Promise<DeltaPage> {
    // Os links devolvidos pelo Graph já incluem o $select original.
    const page = await this.graph.get(link ?? `/drives/${enc(driveId)}/root/delta`, auth, link ? {} : { $select: config.microsoft.deltaSelect, $top: 500 }, {
      headers: { Prefer: 'deltashowremovedasdeleted, deltatraversepermissiongaps' },
    })
    return { items: page.value ?? [], nextLink: page['@odata.nextLink'] ?? null, deltaLink: page['@odata.deltaLink'] ?? null }
  }

  /** Obtém um deltaLink "a partir de agora" sem enumerar o drive (usado na validação). */
  async latestDeltaLink(driveId: string, auth: GraphTokenProvider): Promise<string | null> {
    const page = await this.graph.get(`/drives/${enc(driveId)}/root/delta`, auth, { token: 'latest' })
    return page['@odata.deltaLink'] ?? null
  }

  /** URL pré-autenticado e de curta duração para o original (suporta Range), a partir do 302 de /content. */
  async downloadUrl(driveId: string, itemId: string, auth: GraphTokenProvider): Promise<string> {
    const res = await this.graph.send('GET', `${itemPath(driveId, itemId)}/content`, auth, { redirects: false, retries: 2, maxWaitMs: 5000 })
    const location = res.headers.get('location')
    if (!location) throw new GraphApiError('No download location returned', res.status, 'noLocation')
    return location
  }

  /** DELETE no Graph = mover para a Reciclagem do OneDrive/SharePoint (recuperável). Nunca permanentDelete. */
  async moveToRecycleBin(driveId: string, itemId: string, auth: GraphTokenProvider): Promise<void> {
    await this.graph.send('DELETE', itemPath(driveId, itemId), auth, { retries: 2, maxWaitMs: 5000 })
  }

  /** Sessão de upload: o browser envia os blocos directamente para o URL devolvido. */
  async createUploadSession(driveId: string, parentItemId: string, fileName: string, auth: GraphTokenProvider) {
    const res = await this.graph.send('POST', `${itemPath(driveId, parentItemId)}:/${enc(fileName)}:/createUploadSession`, auth, {
      json: { item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } },
      retries: 2,
      maxWaitMs: 5000,
    })
    return (await res.json()) as { uploadUrl: string; expirationDateTime?: string }
  }

  /** Miniatura gerada pelo Microsoft 365 (tamanhos personalizados também convertem HEIC para JPEG). */
  async thumbnail(driveId: string, itemId: string, graphSize: string, auth: GraphTokenProvider): Promise<{ body: ArrayBuffer; mime: string }> {
    const res = await this.graph.send('GET', `${itemPath(driveId, itemId)}/thumbnails/0/${enc(graphSize)}/content`, auth, { retries: 2, timeoutMs: 20_000, maxWaitMs: 5000 })
    return { body: await res.arrayBuffer(), mime: res.headers.get('content-type') || 'image/jpeg' }
  }
}

export class SharePoint {
  constructor(private readonly graph = new GraphClient()) {}

  async searchSites(query: string, auth: GraphTokenProvider) {
    const sites = []
    for await (const site of this.graph.paginate('/sites', auth, { search: query, $select: 'id,displayName,name,webUrl' }, 50)) sites.push(mapSite(site))
    return sites
  }

  /** Resolve um site pelo URL (ex.: https://org.sharepoint.com/sites/Fotos). Funciona com Sites.Selected. */
  async getSiteByUrl(url: string, auth: GraphTokenProvider) {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/+|\/+$/g, '')
    const resource = path === '' ? `/sites/${u.host}` : `/sites/${u.host}:/${path}`
    return mapSite(await this.graph.get(resource, auth, { $select: 'id,displayName,name,webUrl' }))
  }

  async siteDrives(siteId: string, auth: GraphTokenProvider) {
    const drives = []
    for await (const d of this.graph.paginate(`/sites/${enc(siteId)}/drives`, auth, { $select: 'id,name,driveType,webUrl' })) {
      drives.push({ id: d.id as string, name: d.name as string, drive_type: (d.driveType as string) ?? 'documentLibrary', web_url: (d.webUrl as string) ?? null })
    }
    return drives
  }
}

const mapSite = (s: Record<string, any>) => ({ id: s.id as string, name: (s.displayName ?? s.name ?? s.id) as string, web_url: (s.webUrl as string) ?? null })
