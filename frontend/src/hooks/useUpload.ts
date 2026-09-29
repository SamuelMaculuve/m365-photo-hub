import { useCallback, useRef, useState } from 'react'
import { uploadsService } from '@/services/uploads'

export type UploadState = 'queued' | 'uploading' | 'done' | 'error'

export interface UploadItem {
  key: string
  file: File
  sent: number
  state: UploadState
  error?: unknown
}

/** Carregamento sequencial: sessão na API → PUT por blocos para o Microsoft 365. */
export function useUpload() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const patch = (key: string, p: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)))

  const start = useCallback(async (libraryId: number, files: File[]) => {
    const queue = files.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, sent: 0, state: 'queued' as UploadState }))
    setItems(queue)
    setRunning(true)
    abort.current = new AbortController()
    for (const item of queue) {
      if (abort.current.signal.aborted) break
      patch(item.key, { state: 'uploading' })
      try {
        const session = await uploadsService.createSession(libraryId, item.file)
        await uploadsService.putChunks(session, item.file, (sent) => patch(item.key, { sent }), abort.current.signal)
        patch(item.key, { state: 'done', sent: item.file.size })
      } catch (error) {
        patch(item.key, { state: 'error', error })
      }
    }
    setRunning(false)
  }, [])

  const cancel = useCallback(() => abort.current?.abort(), [])
  const reset = useCallback(() => setItems([]), [])

  return { items, running, start, cancel, reset }
}
