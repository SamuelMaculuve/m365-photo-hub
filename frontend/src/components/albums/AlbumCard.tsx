import { Link } from 'react-router'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Album } from '@/types'
import { AlbumCover } from './AlbumCover'

export function AlbumCard({ album }: { album: Album }) {
  const { t } = useTranslation()
  return (
    <Link
      to={`/albums/${album.id}`}
      className="group flex flex-col gap-2 rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <AlbumCover album={album} />
      <div className="px-1">
        <h3 className="truncate text-sm font-medium">{album.name}</h3>
        <p className="flex items-center gap-1 text-xs text-muted">
          {t('albums.itemCount', { count: album.media_count })}
          {album.visibility === 'organisation' && (
            <>
              <span aria-hidden="true">·</span>
              <Building2 className="size-3" aria-hidden="true" />
              <span>{t('albums.visibilityOrganisation')}</span>
            </>
          )}
        </p>
      </div>
    </Link>
  )
}
