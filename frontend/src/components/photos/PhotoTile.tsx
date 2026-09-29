import { memo, useState } from 'react'
import { Check, Heart, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { cn } from '@/lib/utils'
import { formatDate, formatDuration } from '@/lib/format'

export interface PhotoTileProps {
  item: Media
  index: number
  size: number
  selected: boolean
  selectionMode: boolean
  locale: string
  onOpen: (index: number) => void
  onToggleSelect?: (id: number) => void
  onToggleFavourite?: (item: Media) => void
}

/** Texto alternativo: nome do ficheiro + data. */
export function mediaAlt(item: Media, locale: string): string {
  const date = formatDate(item.taken_at ?? item.sort_at, locale)
  return date ? `${item.name}, ${date}` : item.name
}

function PhotoTileBase({
  item,
  index,
  size,
  selected,
  selectionMode,
  locale,
  onOpen,
  onToggleSelect,
  onToggleFavourite,
}: PhotoTileProps) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const isVideo = item.type === 'video'

  const handleClick = () => {
    if (selectionMode && onToggleSelect) onToggleSelect(item.id)
    else onOpen(index)
  }

  return (
    <div className="group relative shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        data-index={index}
        onClick={handleClick}
        aria-pressed={selectionMode ? selected : undefined}
        className={cn(
          'block size-full overflow-hidden rounded-md bg-skeleton transition-transform duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          selected && 'scale-[0.88] rounded-xl',
        )}
      >
        {!failed ? (
          <img
            src={item.thumbnails.medium}
            alt={mediaAlt(item, locale)}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn(
              'size-full object-cover transition-opacity duration-300',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        ) : (
          <span className="flex size-full items-center justify-center px-2 text-center text-xs text-muted">
            <span className="sr-only">{mediaAlt(item, locale)}</span>
            <span aria-hidden="true" className="line-clamp-3 break-all">{item.name}</span>
          </span>
        )}
        {isVideo && (
          <span className="pointer-events-none absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Play className="size-3 fill-current" aria-hidden="true" />
            <span>{formatDuration(item.duration_ms)}</span>
            <span className="sr-only">{t('photos.video')}</span>
          </span>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
        />
      </button>

      {onToggleSelect && (
        <button
          type="button"
          onClick={() => onToggleSelect(item.id)}
          aria-pressed={selected}
          aria-label={t(selected ? 'photos.deselectItem' : 'photos.selectItem', { name: item.name })}
          className={cn(
            'absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 transition-opacity focus-visible:opacity-100',
            selected
              ? 'border-accent bg-accent text-accent-foreground opacity-100'
              : 'border-white/90 bg-black/20 text-transparent hover:text-white/80',
            selectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </button>
      )}

      {onToggleFavourite && !selectionMode && (
        <button
          type="button"
          onClick={() => onToggleFavourite(item)}
          aria-pressed={item.is_favourite}
          aria-label={t(item.is_favourite ? 'photos.unfavourite' : 'photos.favourite')}
          className={cn(
            'absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full text-white transition-opacity hover:bg-black/30 focus-visible:opacity-100',
            item.is_favourite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Heart className={cn('size-4 drop-shadow', item.is_favourite && 'fill-current')} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export const PhotoTile = memo(PhotoTileBase)
