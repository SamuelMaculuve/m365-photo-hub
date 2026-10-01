import { useCallback, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, List, Map as MapIcon, MapPin } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { usePlaces } from '@/hooks/usePlaces'
import { usePhotos } from '@/hooks/usePhotos'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { MediaBrowser } from '@/components/photos/MediaBrowser'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlacesMap } from '@/components/map'
import type { Place } from '@/types'

type View = 'list' | 'map'

const placeHref = (name: string) => `/places?place=${encodeURIComponent(name)}`

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

function PlacesMapView({ places }: { places: Place[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const withCoords = places.filter((p) => p.latitude != null && p.longitude != null)
  const missing = places.length - withCoords.length
  const countLabel = useCallback(
    (count: number) => t('places.count', { count, formatted: formatNumber(count, locale) }),
    [t, locale],
  )
  if (withCoords.length === 0) {
    return <EmptyState icon={MapPin} title={t('places.noCoordsTitle')} description={t('places.noCoordsBody')} />
  }
  return (
    <>
      <PlacesMap
        places={withCoords}
        ariaLabel={t('places.mapLabel')}
        onOpenPlace={(name) => navigate(placeHref(name))}
        countLabel={countLabel}
        openLabel={t('places.openPlace')}
        className="relative z-0 h-[65vh] min-h-80 w-full overflow-hidden rounded-2xl border border-border"
      />
      {missing > 0 && <p className="mt-2 text-xs text-muted">{t('places.withoutCoords', { count: missing })}</p>}
    </>
  )
}

function PlacesList({ places }: { places: Place[] }) {
  const { t } = useTranslation()
  const locale = useLocale()
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {places.map((p) => (
        <li key={p.name}>
          <Link to={placeHref(p.name)} className="group block rounded-2xl p-1 focus-visible:outline-2 focus-visible:outline-ring">
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
  )
}

export default function PlacesPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const place = params.get('place')
  const view: View = params.get('view') === 'map' ? 'map' : 'list'
  const places = usePlaces()

  const setView = (next: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'map') p.set('view', 'map')
        else p.delete('view')
        return p
      },
      { replace: true },
    )
  }

  if (place) return <PlaceMedia place={place} />

  const data = places.data ?? []

  return (
    <Tabs value={view} onValueChange={setView}>
      <PageHeader
        title={t('places.title')}
        description={t('places.subtitle')}
        actions={
          data.length > 0 ? (
            <TabsList aria-label={t('places.view')}>
              <TabsTrigger value="list" className="inline-flex items-center gap-1.5">
                <List className="size-4" aria-hidden="true" /> {t('places.viewList')}
              </TabsTrigger>
              <TabsTrigger value="map" className="inline-flex items-center gap-1.5">
                <MapIcon className="size-4" aria-hidden="true" /> {t('places.viewMap')}
              </TabsTrigger>
            </TabsList>
          ) : undefined
        }
      />
      {places.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-xl" />)}
        </div>
      ) : places.error ? (
        <ErrorState error={places.error} onRetry={() => places.refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon={MapPin} title={t('places.emptyTitle')} description={t('places.emptyBody')} />
      ) : (
        <TabsContent value={view} className="focus-visible:outline-none">
          {view === 'map' ? <PlacesMapView places={data} /> : <PlacesList places={data} />}
          <p className="mt-4 text-xs text-muted">
            {/* Licença CC BY 4.0 dos nomes de localidades exige atribuição visível. */}
            <Trans
              i18nKey="places.attribution"
              components={{ geoLink: <a className="underline hover:text-foreground" href="https://www.geonames.org" target="_blank" rel="noopener noreferrer" /> }}
            />
          </p>
        </TabsContent>
      )}
    </Tabs>
  )
}
