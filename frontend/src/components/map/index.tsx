import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { MiniMapProps, PlacesMapProps } from './LeafletMaps'

export type { MiniMapVariant } from './LeafletMaps'

// Leaflet (~150 kB) só é descarregado quando um mapa é realmente mostrado.
const MiniMapImpl = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.MiniMap })))
const PlacesMapImpl = lazy(() => import('./LeafletMaps').then((m) => ({ default: m.PlacesMap })))

export function MiniMap(props: MiniMapProps) {
  return (
    <Suspense fallback={<Skeleton className={cn(props.className)} />}>
      <MiniMapImpl {...props} />
    </Suspense>
  )
}

export function PlacesMap(props: PlacesMapProps) {
  return (
    <Suspense fallback={<Skeleton className={cn(props.className)} />}>
      <PlacesMapImpl {...props} />
    </Suspense>
  )
}
