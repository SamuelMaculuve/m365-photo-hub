import { PLACES } from './places-data'

const NEAR_MAX_KM = 120

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface ResolvedPlace { name: string; region: string | null; country: string | null; distanceKm: number | null }

/**
 * Geocodificação inversa offline (nenhuma coordenada sai do servidor): localidade conhecida mais próxima.
 * distanceKm null = dentro da localidade; caso contrário "perto de" (até 120 km).
 */
export function resolvePlace(lat: number, lng: number): ResolvedPlace | null {
  let best: ResolvedPlace | null = null
  let bestD = Infinity
  for (const [name, region, plat, plng] of PLACES) {
    const d = haversine(lat, lng, plat, plng)
    if (d <= NEAR_MAX_KM && d < bestD) {
      bestD = d
      best = { name, region, country: 'MZ', distanceKm: d <= 10 ? null : Math.round(d * 10) / 10 }
    }
  }
  return best
}

export const findKnownPlace = (name: string) => PLACES.find(([n]) => n.toLowerCase() === name.toLowerCase()) ?? null
