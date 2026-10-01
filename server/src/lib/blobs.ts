/**
 * Armazenamento de derivados pequenos (miniaturas — nunca os originais):
 * - Netlify: Netlify Blobs (store "thumbnails");
 * - desenvolvimento/testes: memória.
 */
export interface BlobStore {
  get(key: string): Promise<{ data: ArrayBuffer; mime: string } | null>
  set(key: string, data: ArrayBuffer, mime: string): Promise<void>
}

class MemoryStore implements BlobStore {
  private readonly items = new Map<string, { data: ArrayBuffer; mime: string }>()
  async get(key: string) { return this.items.get(key) ?? null }
  async set(key: string, data: ArrayBuffer, mime: string) { this.items.set(key, { data, mime }) }
  clear() { this.items.clear() }
}

class NetlifyStore implements BlobStore {
  constructor(private readonly name: string) {}
  private async store() {
    const { getStore } = await import('@netlify/blobs')
    return getStore({ name: this.name, consistency: 'eventual' })
  }
  async get(key: string) {
    const hit = await (await this.store()).getWithMetadata(key, { type: 'arrayBuffer' })
    return hit ? { data: hit.data, mime: String(hit.metadata?.mime ?? 'image/jpeg') } : null
  }
  async set(key: string, data: ArrayBuffer, mime: string) {
    await (await this.store()).set(key, data, { metadata: { mime, at: Date.now() } })
  }
}

let thumbs: BlobStore | null = null
export const memoryThumbnails = new MemoryStore()

export function thumbnailStore(): BlobStore {
  thumbs ??= process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT ? new NetlifyStore('thumbnails') : memoryThumbnails
  return thumbs
}
