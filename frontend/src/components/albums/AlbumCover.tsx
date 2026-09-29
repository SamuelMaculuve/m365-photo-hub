import { Images } from 'lucide-react'
import type { Album } from '@/types'
import { cn } from '@/lib/utils'

export function AlbumCover({ album, className }: { album: Pick<Album, 'cover' | 'name'>; className?: string }) {
  return (
    <div className={cn('aspect-square overflow-hidden rounded-xl bg-surface-2', className)}>
      {album.cover ? (
        <img
          src={album.cover.thumbnails.medium}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted">
          <Images className="size-8" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
