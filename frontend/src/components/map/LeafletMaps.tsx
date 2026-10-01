/**
 * Mapas Leaflet. Este módulo só é carregado a pedido (React.lazy, ver ./index.tsx),
 * para que o Leaflet e o respectivo CSS não entrem no bundle principal.
 */
import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { Circle, CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './map.css'
import type { Place } from '@/types'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/** Ícone em HTML/CSS: evita o problema das imagens do marcador por omissão com bundlers. */
const pinIcon = L.divIcon({
  className: 'fotos-map-pin',
  html: '<span></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -22],
})

const accent = { color: '#0d9488', fillColor: '#14b8a6' }

function Tiles() {
  return <TileLayer url={TILE_URL} attribution={ATTRIBUTION} className="fotos-map-tiles" />
}

export type MiniMapVariant = 'point' | 'estimated' | 'manual'

export interface MiniMapProps {
  latitude: number
  longitude: number
  variant: MiniMapVariant
  ariaLabel: string
  className?: string
}

const RADIUS_M: Record<Exclude<MiniMapVariant, 'point'>, number> = { estimated: 2000, manual: 5000 }
// Zoom 13 para GPS; os círculos precisam de um pouco mais de área para caberem na caixa.
const ZOOM: Record<MiniMapVariant, number> = { point: 13, estimated: 12, manual: 11 }

export function MiniMap({ latitude, longitude, variant, ariaLabel, className }: MiniMapProps) {
  const center: [number, number] = [latitude, longitude]
  return (
    <div role="region" aria-label={ariaLabel} className={className}>
      <MapContainer
        // As props do MapContainer só são lidas na montagem: remontar quando a posição muda.
        key={`${latitude},${longitude},${variant}`}
        center={center}
        zoom={ZOOM[variant]}
        scrollWheelZoom={false}
        dragging
        zoomControl={false}
        className="size-full"
      >
        <Tiles />
        {variant === 'point' ? (
          <Marker position={center} icon={pinIcon} keyboard={false} />
        ) : (
          <Circle center={center} radius={RADIUS_M[variant]} pathOptions={{ ...accent, weight: 1.5, fillOpacity: 0.2 }} />
        )}
      </MapContainer>
    </div>
  )
}

type PlaceWithCoords = Place & { latitude: number; longitude: number }

export interface PlacesMapProps {
  places: Place[]
  ariaLabel: string
  onOpenPlace: (name: string) => void
  /** Texto do popup: contagem já formatada e rótulo do botão. */
  countLabel: (count: number) => string
  openLabel: string
  className?: string
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) map.setView(points[0], 11)
    else map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 12 })
  }, [map, points])
  return null
}

function radiusFor(count: number): number {
  return Math.min(24, 6 + Math.log10(Math.max(1, count)) * 5)
}

export function PlacesMap({ places, ariaLabel, onOpenPlace, countLabel, openLabel, className }: PlacesMapProps) {
  const withCoords = useMemo(
    () => places.filter((p): p is PlaceWithCoords => p.latitude != null && p.longitude != null),
    [places],
  )
  const points = useMemo(() => withCoords.map((p) => [p.latitude, p.longitude] as [number, number]), [withCoords])
  return (
    <div role="region" aria-label={ariaLabel} className={className}>
      <MapContainer center={points[0] ?? [-18.67, 35.53]} zoom={6} scrollWheelZoom className="size-full">
        <Tiles />
        <FitBounds points={points} />
        {withCoords.map((p) => (
          <CircleMarker
            key={p.name}
            center={[p.latitude, p.longitude]}
            radius={radiusFor(p.count)}
            pathOptions={{ ...accent, weight: 2, fillOpacity: 0.55 }}
          >
            <Popup>
              <div className="fotos-map-popup">
                {p.cover && <img src={p.cover.thumbnails.small} alt="" loading="lazy" decoding="async" />}
                <strong>{p.name}</strong>
                <span>{[p.admin1, countLabel(p.count)].filter(Boolean).join(' · ')}</span>
                <button type="button" onClick={() => onOpenPlace(p.name)}>{openLabel}</button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
