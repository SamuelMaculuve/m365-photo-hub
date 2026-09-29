import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlaces } from '@/hooks/usePlaces'
import { usePhotos } from '@/hooks/usePhotos'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { MediaBrowser } from '@/components/photos/MediaBrowser'

function PlaceMedia({ place }: { place: string }) {
  const { t } = useTranslation()
  const filters = useMemo(() => ({ place }), [place])
  const photos = usePhotos(filters)
  return (
    <>
      <div className="mb-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/places"><ArrowLeft /> {t('places.title')}</Link>
        </Button>
      </div>
      <PageHeader title={place} />
      <MediaBrowser query={photos} label={place} empty={<EmptyState icon={MapPin} title={t('places.noMedia')} />} />
    </>
  )
}

export default function PlacesPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [params] = useSearchParams()
  const place = params.get('place')
  const places = usePlaces()

  if (place) return <PlaceMedia place={place} />

  return (
    <>
      <PageHeader title={t('places.title')} description={t('places.subtitle')} />
      {places.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-xl" />)}
        </div>
      ) : places.error ? (
        <ErrorState error={places.error} onRetry={() => places.refetch()} />
      ) : (places.data ?? []).length === 0 ? (
        <EmptyState icon={MapPin} title={t('places.emptyTitle')} description={t('places.emptyBody')} />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {(places.data ?? []).map((p) => (
            <li key={p.name}>
              <Link to={`/places?place=${encodeURIComponent(p.name)}`} className="group block rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-ring">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-2">
                  {p.cover ? (
                    <img src={p.cover.thumbnails.medium} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted"><MapPin className="size-8" aria-hidden="true" /></div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                    <h2 className="truncate text-sm font-semibold">{p.name}</h2>
                    <p className="truncate text-xs text-white/80">
                      {[p.admin1, t('places.count', { count: p.count, formatted: formatNumber(p.count, locale) })].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
