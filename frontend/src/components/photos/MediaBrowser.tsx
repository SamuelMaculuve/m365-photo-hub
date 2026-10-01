import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Media, TimelineBucket } from '@/types'
import type { InfiniteMediaResult } from '@/hooks/useInfiniteMedia'
import { useSelection } from '@/hooks/useSelection'
import { useViewerParam } from '@/hooks/useViewerParam'
import { useBulkAction, useToggleFavourite } from '@/hooks/usePhotos'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { PhotoViewer } from '@/components/viewer/PhotoViewer'
import { AddToAlbumDialog } from '@/components/albums/AddToAlbumDialog'
import { SetLocationDialog } from '@/components/places/SetLocationDialog'
import { useCanEditPeople } from '@/hooks/usePeople'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { MapPin } from 'lucide-react'
import { ShareDialog } from '@/components/share/ShareDialog'
import { PhotoGrid, type PhotoGridHandle } from './PhotoGrid'
import { GridSkeleton } from './GridSkeleton'
import { SelectionBar } from './SelectionBar'
import { MonthScrubber } from './MonthScrubber'

export type MediaQueryLike = Pick<
  InfiniteMediaResult,
  'items' | 'isLoading' | 'error' | 'refetch' | 'hasNextPage' | 'fetchNextPage' | 'isFetchingNextPage'
>

export interface MediaBrowserProps {
  query: MediaQueryLike
  label: string
  empty: ReactNode
  groupByDay?: boolean
  buckets?: TimelineBucket[]
  /** Acções extra na barra de selecção (ex.: remover do álbum). */
  selectionExtra?: (ids: number[], clear: () => void) => ReactNode
  allowTrash?: boolean
}

export function MediaBrowser({ query, label, empty, groupByDay = true, buckets, selectionExtra, allowTrash = true }: MediaBrowserProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const { items, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = query
  const selection = useSelection()
  const viewer = useViewerParam()
  const favourite = useToggleFavourite()
  const bulk = useBulkAction()
  const [albumOpen, setAlbumOpen] = useState(false)
  const [locationOpen, setLocationOpen] = useState(false)
  const canEdit = useCanEditPeople()
  const [shareOpen, setShareOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)

  const gridHandle = useRef<PhotoGridHandle | null>(null)
  const [pendingMonth, setPendingMonth] = useState<string | null>(null)
  const pagesLoaded = useRef(0)

  const onOpen = useCallback((index: number) => viewer.open(items[index].id), [viewer, items])
  const onToggleFavourite = useCallback(
    (m: Media) =>
      favourite.mutate({ id: m.id, value: !m.is_favourite }, { onError: (e) => toast.error(errorMessage(e)) }),
    [favourite, errorMessage],
  )
  const onReady = useCallback((h: PhotoGridHandle) => {
    gridHandle.current = h
  }, [])

  // Saltar para um mês ainda não carregado: carregar páginas até o encontrar (limite de segurança).
  useEffect(() => {
    if (!pendingMonth) return
    if (gridHandle.current?.scrollToMonth(pendingMonth)) {
      setPendingMonth(null)
      return
    }
    if (hasNextPage && !isFetchingNextPage && pagesLoaded.current < 60) {
      pagesLoaded.current++
      void fetchNextPage()
    } else if (!hasNextPage || pagesLoaded.current >= 60) {
      setPendingMonth(null)
    }
  }, [pendingMonth, items, hasNextPage, isFetchingNextPage, fetchNextPage])

  const jump = (month: string) => {
    pagesLoaded.current = 0
    if (!gridHandle.current?.scrollToMonth(month)) setPendingMonth(month)
  }

  const ids = [...selection.ids]
  const selectedItems = items.filter((m) => selection.ids.has(m.id))
  const allFav = selectedItems.length > 0 && selectedItems.every((m) => m.is_favourite)

  const runBulk = (action: 'favorite' | 'unfavorite' | 'trash') =>
    bulk.mutate(
      { action, ids },
      {
        onSuccess: () => {
          toast.success(t(`selection.done.${action}`, { count: ids.length }))
          selection.clear()
          setTrashOpen(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  if (isLoading) return <GridSkeleton />
  if (error && items.length === 0) return <ErrorState error={error} onRetry={() => refetch()} />
  if (items.length === 0) return <>{empty}</>

  return (
    <>
      <SelectionBar
        count={selection.count}
        onClear={selection.clear}
        busy={bulk.isPending}
        onFavourite={() => runBulk(allFav ? 'unfavorite' : 'favorite')}
        onAddToAlbum={() => setAlbumOpen(true)}
        onShare={() => setShareOpen(true)}
        onTrash={allowTrash ? () => setTrashOpen(true) : undefined}
        extra={
          <>
            {canEdit && (
              <Tooltip content={t('location.set')}>
                <Button variant="ghost" size="icon" aria-label={t('location.set')} onClick={() => setLocationOpen(true)} disabled={bulk.isPending}>
                  <MapPin />
                </Button>
              </Tooltip>
            )}
            {selectionExtra?.(ids, selection.clear)}
          </>
        }
      />
      <PhotoGrid
        items={items}
        groupByDay={groupByDay}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        onOpen={onOpen}
        selectedIds={selection.ids}
        onToggleSelect={selection.toggle}
        onToggleFavourite={onToggleFavourite}
        onReady={onReady}
        label={label}
      />
      {buckets && groupByDay && <MonthScrubber buckets={buckets} onJump={jump} />}
      {viewer.photoId != null && (
        <PhotoViewer
          items={items}
          photoId={viewer.photoId}
          onNavigate={viewer.go}
          onClose={viewer.close}
          onNearEnd={loadMore}
        />
      )}
      <AddToAlbumDialog open={albumOpen} onOpenChange={setAlbumOpen} mediaIds={ids} onDone={selection.clear} />
      {canEdit && <SetLocationDialog open={locationOpen} onOpenChange={setLocationOpen} mediaIds={ids} onDone={selection.clear} />}
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} target={{ type: 'media', media_ids: ids }} />
      <ConfirmDialog
        open={trashOpen}
        onOpenChange={setTrashOpen}
        title={t('selection.confirmTrashTitle', { count: ids.length })}
        description={t('viewer.confirmTrashBody')}
        confirmLabel={t('viewer.moveToTrash')}
        destructive
        pending={bulk.isPending}
        onConfirm={() => runBulk('trash')}
      />
    </>
  )
}
