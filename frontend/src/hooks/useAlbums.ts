import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { albumsService } from '@/services/albums'
import { qk } from '@/lib/queryKeys'
import type { AlbumInput } from '@/types'
import { useInfiniteMedia } from './useInfiniteMedia'
import { removeMediaFromCaches } from './useMediaCache'

export function useAlbums(q?: string) {
  return useQuery({
    queryKey: qk.albums(q),
    queryFn: () => albumsService.list({ q: q || undefined }),
  })
}

export function useAlbum(id: number) {
  return useQuery({ queryKey: qk.album(id), queryFn: () => albumsService.get(id) })
}

export function useAlbumMedia(id: number) {
  return useInfiniteMedia(qk.albumMedia(id), (cursor) => albumsService.media(id, cursor))
}

export function useCreateAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: albumsService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.albumsAll }),
  })
}

export function useUpdateAlbum(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AlbumInput) => albumsService.update(id, input),
    onSuccess: (album) => {
      qc.setQueryData(qk.album(id), album)
      void qc.invalidateQueries({ queryKey: qk.albumsAll })
    },
  })
}

export function useDeleteAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => albumsService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.albumsAll }),
  })
}

export function useAddToAlbum() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ albumId, mediaIds }: { albumId: number; mediaIds: number[] }) =>
      albumsService.addMedia(albumId, mediaIds),
    onSuccess: (_d, { albumId, mediaIds }) => {
      void qc.invalidateQueries({ queryKey: qk.albumMedia(albumId) })
      void qc.invalidateQueries({ queryKey: qk.album(albumId) })
      void qc.invalidateQueries({ queryKey: qk.albumsAll })
      for (const id of mediaIds) void qc.invalidateQueries({ queryKey: qk.photo(id) })
    },
  })
}

export function useRemoveFromAlbum(albumId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (mediaIds: number[]) => albumsService.removeMedia(albumId, mediaIds),
    onSuccess: (_d, mediaIds) => {
      removeMediaFromCaches(qc, mediaIds, ['album-media'])
      void qc.invalidateQueries({ queryKey: qk.album(albumId) })
      void qc.invalidateQueries({ queryKey: qk.albumsAll })
    },
  })
}
