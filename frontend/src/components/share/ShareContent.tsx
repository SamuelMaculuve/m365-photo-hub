import { useCallback } from 'react'
import { ImageOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media, PublicShare } from '@/types'
import { useViewerParam } from '@/hooks/useViewerParam'
import { useLocale } from '@/hooks/useLocale'
import { formatDate } from '@/lib/format'
import { EmptyState } from '@/components/ui/states'
import { PhotoGrid } from '@/components/photos/PhotoGrid'
import { PhotoViewer } from '@/components/viewer/PhotoViewer'

/**
 * Grelha + visualizador simples do conteúdo de uma partilha.
 * Os URLs dos itens (miniaturas, stream, download) vêm pré-assinados e são usados tal como estão.
 */
export function ShareContent({ share }: { share: PublicShare }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const viewer = useViewerParam()
  const items = share.items ?? []
  const downloadUrl = useCallback((m: Media) => m.download_url ?? null, [])

  return (
    <>
      <header className="pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{share.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {[
            t('albums.itemCount', { count: items.length }),
            share.created_by ? t('shared.sharedBy', { name: share.created_by.name }) : null,
            share.expires_at ? t('share.expiresOn', { date: formatDate(share.expires_at, locale) }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>
      {items.length === 0 ? (
        <EmptyState icon={ImageOff} title={t('publicShare.emptyTitle')} />
      ) : (
        <PhotoGrid items={items} groupByDay={false} onOpen={(i) => viewer.open(items[i].id)} label={share.title} />
      )}
      {viewer.photoId != null && (
        <PhotoViewer
          variant="public"
          items={items}
          photoId={viewer.photoId}
          onNavigate={viewer.go}
          onClose={viewer.close}
          publicDownloadUrl={downloadUrl}
        />
      )}
    </>
  )
}
