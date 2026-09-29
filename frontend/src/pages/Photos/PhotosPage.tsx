import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaType } from '@/types'
import { useTimeline } from '@/hooks/useTimeline'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/states'
import { TypeFilterChips } from '@/components/photos/FilterChips'
import { MediaBrowser } from '@/components/photos/MediaBrowser'

export function useTypeParam(): [MediaType | undefined, (v: MediaType | undefined) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get('type')
  const type = raw === 'image' || raw === 'video' ? raw : undefined
  const set = (v: MediaType | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('type', v)
        else next.delete('type')
        next.delete('photo')
        return next
      },
      { replace: true },
    )
  return [type, set]
}

export default function PhotosPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [type, setType] = useTypeParam()
  const filters = useMemo(() => ({ type }), [type])
  const { buckets, photos, total } = useTimeline(filters)

  return (
    <>
      <PageHeader
        title={t('photos.title')}
        description={total != null ? t('photos.total', { count: total, formatted: formatNumber(total, locale) }) : undefined}
        actions={<TypeFilterChips value={type} onChange={setType} />}
      />
      <MediaBrowser
        query={photos}
        buckets={buckets.data}
        label={t('photos.title')}
        empty={
          <EmptyState
            icon={ImagePlus}
            title={type ? t('photos.emptyFilteredTitle') : t('photos.emptyTitle')}
            description={type ? t('photos.emptyFilteredBody') : t('photos.emptyBody')}
          />
        }
      />
    </>
  )
}
