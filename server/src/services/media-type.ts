import { config } from '../config'

export type MediaType = 'image' | 'video'

const ext = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '')

/** Devolve o tipo suportado ou null se o ficheiro não for uma fotografia/vídeo suportado. */
export function detectMediaType(fileName: string, mimeType: string | null | undefined): MediaType | null {
  const e = ext(fileName)
  const mime = (mimeType ?? '').toLowerCase()
  for (const type of ['image', 'video'] as const) {
    const def = config.media[type]
    if (def.extensions.includes(e) || (mime && def.mime.includes(mime))) return type
  }
  return null
}

export function guessMime(fileName: string): string | null {
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
    gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  }
  return map[ext(fileName)] ?? null
}
