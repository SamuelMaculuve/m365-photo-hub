import { useQuery } from '@tanstack/react-query'
import { photosService } from '@/services/photos'
import { qk } from '@/lib/queryKeys'
import type { PhotoFilters } from '@/types'
import { usePhotos } from './usePhotos'

export function useTimelineBuckets(filters: PhotoFilters) {
  return useQuery({
    queryKey: qk.buckets(filters),
    queryFn: () => photosService.buckets(filters),
    staleTime: 60_000,
  })
}

/** Timeline = buckets (contagens mensais) + lista infinita por cursor. */
export function useTimeline(filters: PhotoFilters) {
  const buckets = useTimelineBuckets(filters)
  const photos = usePhotos(filters)
  const total = buckets.data?.reduce((s, b) => s + b.count, 0) ?? null
  return { buckets, photos, total }
}
