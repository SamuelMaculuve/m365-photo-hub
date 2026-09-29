import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { mediaAlt } from '@/components/photos/PhotoTile'
import { Spinner } from '@/components/ui/spinner'

interface ViewerMediaProps {
  item: Media
  locale: string
  transform: string
  animate: boolean
  errorMessage?: string | null
}

/** Imagem progressiva (large → xlarge) ou vídeo. */
export function ViewerMedia({ item, locale, transform, animate, errorMessage }: ViewerMediaProps) {
  const { t } = useTranslation()
  const [src, setSrc] = useState(item.thumbnails.large)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setSrc(item.thumbnails.large)
    setLoaded(false)
    setFailed(false)
    if (item.type !== 'image') return
    let cancelled = false
    const hi = new Image()
    hi.decoding = 'async'
    hi.onload = () => {
      if (!cancelled) setSrc(item.thumbnails.xlarge)
    }
    hi.src = item.thumbnails.xlarge
    return () => {
      cancelled = true
      hi.onload = null
    }
  }, [item.id, item.type, item.thumbnails.large, item.thumbnails.xlarge])

  if (failed || errorMessage) {
    return (
      <div role="alert" className="flex max-w-md flex-col items-center gap-3 px-6 text-center text-white/90">
        <ImageOff className="size-10 text-white/60" aria-hidden="true" />
        <p className="text-sm">{errorMessage ?? t('viewer.unavailable')}</p>
      </div>
    )
  }

  if (item.type === 'video' && item.stream_url) {
    return (
      <video
        key={item.id}
        controls
        playsInline
        preload="metadata"
        src={item.stream_url}
        poster={item.thumbnails.xlarge}
        onError={() => setFailed(true)}
        className="max-h-full max-w-full"
        aria-label={mediaAlt(item, locale)}
      />
    )
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="text-white/70" />
        </div>
      )}
      <img
        key={item.id}
        src={src}
        alt={mediaAlt(item, locale)}
        draggable={false}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (src !== item.thumbnails.xlarge) setSrc(item.thumbnails.xlarge)
          else setFailed(true)
        }}
        style={{ transform }}
        className={
          'max-h-full max-w-full select-none object-contain ' +
          (animate ? 'transition-transform duration-200 ease-out' : '')
        }
      />
    </>
  )
}
