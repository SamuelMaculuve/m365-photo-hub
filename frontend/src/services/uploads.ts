import { api } from './api'
import type { UploadSession } from '@/types'

export class UploadError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'UploadError'
    this.status = status
  }
}

/** Divide [0,total) em intervalos de chunkSize: [[start,endInclusive],…]. */
export function chunkRanges(total: number, chunkSize: number): [number, number][] {
  const size = Math.max(1, Math.floor(chunkSize))
  const out: [number, number][] = []
  for (let start = 0; start < total; start += size) {
    out.push([start, Math.min(total, start + size) - 1])
  }
  return out
}

export const uploadsService = {
  createSession: async (libraryId: number, file: { name: string; size: number }) =>
    (
      await api.post<{ data: UploadSession }>(`/api/libraries/${libraryId}/uploads`, {
        file_name: file.name,
        size: file.size,
      })
    ).data.data,

  /**
   * Envia o ficheiro directamente para o URL pré-autenticado do Microsoft 365.
   * Usa fetch (não o axios da API): outra origem, sem cookies nem cabeçalho XSRF.
   */
  putChunks: async (
    session: UploadSession,
    file: Blob,
    onProgress?: (sent: number, total: number) => void,
    signal?: AbortSignal,
  ) => {
    const total = file.size
    for (const [start, end] of chunkRanges(total, session.chunk_size || 5 * 327_680)) {
      const res = await fetch(session.upload_url, {
        method: 'PUT',
        credentials: 'omit',
        headers: { 'Content-Range': `bytes ${start}-${end}/${total}` },
        body: file.slice(start, end + 1),
        signal,
      })
      if (!res.ok) throw new UploadError(res.status, res.statusText || 'Upload failed')
      onProgress?.(end + 1, total)
    }
  },
}
