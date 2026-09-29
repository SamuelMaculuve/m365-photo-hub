import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { photosService } from '@/services/photos'
import { qk } from '@/lib/queryKeys'
import type { BulkAction, PhotoFilters } from '@/types'
import { useInfiniteMedia } from './useInfiniteMedia'
import { invalidateMediaLists, patchMediaInCaches, removeMediaFromCaches } from './useMediaCache'

export function usePhotos(filters: PhotoFilters) {
  return useInfiniteMedia(qk.photos(filters), (cursor) =>
    photosService.list({ ...filters, cursor, limit: 100 }),
  )
}

export function usePhotoDetail(id: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.photo(id ?? 0),
    queryFn: () => photosService.get(id as number),
    enabled: enabled && id != null,
  })
}

export function useToggleFavourite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: boolean }) => photosService.favourite(id, value),
    onMutate: ({ id, value }) => patchMediaInCaches(qc, [id], { is_favourite: value }),
    onError: (_e, { id, value }) => patchMediaInCaches(qc, [id], { is_favourite: !value }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['photos', { favourite: true }] }),
  })
}

export function useTrashPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => photosService.trash(id),
    onSuccess: (_d, id) => {
      removeMediaFromCaches(qc, [id])
      void qc.invalidateQueries({ queryKey: qk.trash })
      void qc.invalidateQueries({ queryKey: ['buckets'] })
    },
  })
}

export function useRestorePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => photosService.restore(id),
    onSuccess: (_d, id) => {
      removeMediaFromCaches(qc, [id], ['trash'])
      void invalidateMediaLists(qc)
    },
  })
}

export function useDeleteFromSource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => photosService.deleteFromSource(id),
    onSuccess: (_d, id) => {
      removeMediaFromCaches(qc, [id], ['trash', 'photos', 'search', 'album-media'])
      void invalidateMediaLists(qc)
    },
  })
}

export function useBulkAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ action, ids }: { action: BulkAction; ids: number[] }) => photosService.bulk(action, ids),
    onSuccess: (_d, { action, ids }) => {
      if (action === 'favorite' || action === 'unfavorite') {
        patchMediaInCaches(qc, ids, { is_favourite: action === 'favorite' })
      } else if (action === 'trash') {
        removeMediaFromCaches(qc, ids)
      } else {
        removeMediaFromCaches(qc, ids, ['trash'])
      }
      void invalidateMediaLists(qc)
    },
  })
}

export function useTrash() {
  return useInfiniteMedia(qk.trash, (cursor) => photosService.trashList(cursor))
}
