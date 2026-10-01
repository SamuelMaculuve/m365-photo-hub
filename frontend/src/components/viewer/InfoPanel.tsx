import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Calendar, Camera, ExternalLink, FolderOpen, UserRound, HardDrive, Image as ImageIcon, Library, MapPin, Sparkles, Tag, Type, Users, X, Album as AlbumIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import type { Media, MediaDetail, MediaLocation } from '@/types'
import { formatBytes, formatDateTime, formatNumber, intlLocale } from '@/lib/format'
import { MiniMap, type MiniMapVariant } from '@/components/map'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { PeopleChips } from '@/components/people/PeopleChips'
import { useCanEditPeople } from '@/hooks/usePeople'
import { SetLocationDialog } from '@/components/places/SetLocationDialog'

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-2.5">
      <span className="mt-0.5 text-muted [&_svg]:size-4" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="break-words text-sm">{children}</dd>
      </div>
    </div>
  )
}

function camera(detail: MediaDetail): string | null {
  const m = detail.metadata
  if (!m) return null
  const parts = [
    // "Canon" + "Canon EOS 800D" → "Canon EOS 800D"
    m.camera_model && m.camera_make && String(m.camera_model).toLowerCase().startsWith(String(m.camera_make).toLowerCase())
      ? String(m.camera_model)
      : [m.camera_make, m.camera_model].filter(Boolean).join(' '),
    m.f_number ? `ƒ/${Number(Number(m.f_number).toFixed(1))}` : '',
    m.exposure_time ? `${m.exposure_time}s` : '',
    m.focal_length ? `${Number(Number(m.focal_length).toFixed(1))}mm` : '',
    m.iso ? `ISO ${m.iso}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

/** Nome do país; omitido para Moçambique (o país da organização). */
function countryName(code: string | null | undefined, locale: string): string | null {
  if (!code || code.toUpperCase() === 'MZ') return null
  try {
    return new Intl.DisplayNames([intlLocale(locale)], { type: 'region' }).of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** Distância arredondada: uma casa decimal abaixo de 10 km, inteiros acima. */
function formatKm(km: number, locale: string): string {
  return formatNumber(km < 10 ? Math.round(km * 10) / 10 : Math.round(km), locale)
}

function osmUrl(lat: number, lng: number): string {
  const la = lat.toFixed(5)
  const lo = lng.toFixed(5)
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=15/${la}/${lo}`
}

function LocationDetails({ location, locale }: { location: MediaLocation; locale: string }) {
  const { t } = useTranslation()
  const { place, latitude, longitude, distance_km: km, source } = location
  const href = place ? `/places?place=${encodeURIComponent(place)}` : ''
  const link = place ? <Link className="text-accent hover:underline" to={href}>{place}</Link> : null
  const area = [location.region, countryName(location.country, locale)].filter(Boolean).join(', ')
  const hasCoords = latitude != null && longitude != null
  const variant: MiniMapVariant = source === 'estimated' ? 'estimated' : source === 'manual' ? 'manual' : 'point'
  return (
    <>
      {/* distance_km só vem preenchido quando o ponto está fora da área do local nomeado. */}
      {place && km != null ? (
        <span>
          <Trans
            i18nKey="location.near"
            values={{ place, km: formatKm(km, locale) }}
            components={{ placeLink: <Link className="text-accent hover:underline" to={href} /> }}
          />
        </span>
      ) : (
        link
      )}
      {source === 'estimated' || source === 'manual' ? (
        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted" title={t(`location.sourceHint.${source}`)}>
          {t(`location.source.${source}`)}
        </span>
      ) : null}
      {area && <span className="block text-xs text-muted">{area}</span>}
      {hasCoords && (
        <span className="block text-xs text-muted">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </span>
      )}
      {hasCoords && (
        <div className="mt-2">
          <MiniMap
            latitude={latitude}
            longitude={longitude}
            variant={variant}
            ariaLabel={place ? `${t('location.mapLabel')}: ${place}` : t('location.mapLabel')}
            className="relative z-0 h-40 w-full overflow-hidden rounded-xl border border-border"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            {variant !== 'point' ? (
              <span className="text-muted">{t(variant === 'estimated' ? 'location.areaEstimated' : 'location.areaManual')}</span>
            ) : <span />}
            <a
              className="inline-flex items-center gap-1 text-accent hover:underline"
              href={osmUrl(latitude, longitude)}
              target="_blank"
              rel="noopener noreferrer"
              title={t('location.openInMapHint')}
            >
              {t('location.openInMap')}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </div>
      )}
    </>
  )
}

interface InfoPanelProps {
  item: Media
  detail?: MediaDetail
  loading: boolean
  error: unknown
  locale: string
  onClose: () => void
}

export function InfoPanel({ item, detail, loading, error, locale, onClose }: InfoPanelProps) {
  const { t } = useTranslation()
  const cam = detail ? camera(detail) : null
  const canEditPeople = useCanEditPeople()
  const [locationOpen, setLocationOpen] = useState(false)
  return (
    <aside
      aria-label={t('viewer.info')}
      className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-surface text-foreground shadow-2xl animate-fade-in sm:w-96"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold">{t('viewer.info')}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t('common.close')} onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="px-4 py-2">
        {loading && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}
        {!!error && !loading && <ErrorState error={error} />}
        <dl className="divide-y divide-border">
          <Row icon={<ImageIcon />} label={t('viewer.name')}>{item.name}</Row>
          <Row icon={<Calendar />} label={t('viewer.date')}>
            {formatDateTime(item.taken_at ?? item.sort_at, locale)}
          </Row>
          <Row icon={<HardDrive />} label={t('viewer.file')}>
            {[formatBytes(item.size, locale), item.width && item.height ? `${item.width} × ${item.height}` : null, item.mime_type]
              .filter(Boolean)
              .join(' · ')}
          </Row>
          {cam && <Row icon={<Camera />} label={t('viewer.camera')}>{cam}</Row>}
          {detail?.folder_path && <Row icon={<FolderOpen />} label={t('viewer.folder')}>{detail.folder_path}</Row>}
          {detail?.library && <Row icon={<Library />} label={t('viewer.library')}>{detail.library.name}</Row>}
          {(detail?.location || (detail && canEditPeople)) && (
            <Row icon={<MapPin />} label={t('viewer.location')}>
              {detail?.location ? (
                <LocationDetails location={detail.location} locale={locale} />
              ) : (
                <span className="text-muted">{t('location.unknown')}</span>
              )}
              {canEditPeople && (
                <button type="button" className="mt-1 block text-xs text-accent hover:underline" onClick={() => setLocationOpen(true)}>
                  {detail?.location ? t('location.edit') : t('location.add')}
                </button>
              )}
            </Row>
          )}
          {detail?.people && detail.people.length > 0 && (
            <Row icon={<UserRound />} label={t('viewer.people')}>
              <PeopleChips mediaId={item.id} people={detail.people} canEdit={canEditPeople} />
            </Row>
          )}
          {detail && detail.albums.length > 0 && (
            <Row icon={<AlbumIcon />} label={t('viewer.albums')}>
              <ul className="flex flex-wrap gap-1.5">
                {detail.albums.map((a) => (
                  <li key={a.id}>
                    <Link className="text-accent hover:underline" to={`/albums/${a.id}`}>{a.name}</Link>
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {detail && detail.tags.length > 0 && (
            <Row icon={<Tag />} label={t('viewer.tags')}>
              <ul className="flex flex-wrap gap-1.5">
                {detail.tags.map((tag) => (
                  <li key={`${tag.source}-${tag.name}`} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">
                    {tag.name}
                    {tag.source === 'ai' && <span className="ml-1 text-muted">({t('viewer.tagAi')})</span>}
                  </li>
                ))}
              </ul>
            </Row>
          )}
        </dl>
        {detail?.ai && (
          <section aria-labelledby="viewer-ai-title" className="mt-4 rounded-xl border border-border bg-surface-2/50 p-3">
            <h3 id="viewer-ai-title" className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4 text-accent" aria-hidden="true" />
              {t('viewer.ai.title')}
            </h3>
            <dl>
              {detail.ai.caption && <Row icon={<ImageIcon />} label={t('viewer.ai.caption')}>{detail.ai.caption}</Row>}
              {detail.ai.text && <Row icon={<Type />} label={t('viewer.ai.text')}><span className="whitespace-pre-line">{detail.ai.text}</span></Row>}
              {detail.ai.people_count != null && detail.ai.people_count > 0 && (
                <Row icon={<Users />} label={t('viewer.ai.labels')}>{t('viewer.ai.people', { count: detail.ai.people_count })}</Row>
              )}
            </dl>
            <p className="mt-1 text-xs text-muted">{t('viewer.ai.disclaimer')}</p>
          </section>
        )}
      </div>
      {canEditPeople && <SetLocationDialog open={locationOpen} onOpenChange={setLocationOpen} mediaIds={[item.id]} />}
    </aside>
  )
}
