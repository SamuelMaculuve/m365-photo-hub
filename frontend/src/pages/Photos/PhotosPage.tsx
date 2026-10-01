import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ImagePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaType } from '@/types'
import { useCurrentUser } from '@/hooks/useAuth'
import { useTimeline } from '@/hooks/useTimeline'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/states'
import { OrganizationFilter, TypeFilterChips } from '@/components/photos/FilterChips'
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

/** ?organization_id= na timeline (acervo comum de várias organizações). */
function useOrganizationParam(): [number | undefined, (v: number | undefined) => void] {
  const [params, setParams] = useSearchParams()
  const raw = Number(params.get('organization_id'))
  const value = Number.isInteger(raw) && raw > 0 ? raw : undefined
  const set = (v: number | undefined) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v) next.set('organization_id', String(v))
        else next.delete('organization_id')
        next.delete('photo')
        return next
      },
      { replace: true },
    )
  return [value, set]
}

export default function PhotosPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const user = useCurrentUser()
  const [type, setType] = useTypeParam()
  const [organizationId, setOrganizationId] = useOrganizationParam()
  const filters = useMemo(() => ({ type, organization_id: organizationId }), [type, organizationId])
  const filtered = Boolean(type || organizationId)
  const { buckets, photos, total } = useTimeline(filters)

  return (
    <>
      <PageHeader
        title={t('photos.title')}
        description={total != null ? t('photos.total', { count: total, formatted: formatNumber(total, locale) }) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <OrganizationFilter organizations={user?.organizations ?? []} value={organizationId} onChange={setOrganizationId} />
            <TypeFilterChips value={type} onChange={setType} />
          </div>
        }
      />
      <MediaBrowser
        query={photos}
        buckets={buckets.data}
        label={t('photos.title')}
        empty={
          <EmptyState
            icon={ImagePlus}
            title={filtered ? t('photos.emptyFilteredTitle') : t('photos.emptyTitle')}
            description={filtered ? t('photos.emptyFilteredBody') : t('photos.emptyBody')}
          />
        }
      />
    </>
  )
}
