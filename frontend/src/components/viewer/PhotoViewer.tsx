import { useCallback, useEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { usePhotoDetail, useToggleFavourite, useTrashPhoto } from '@/hooks/usePhotos'
import { useViewerGestures } from '@/hooks/useViewerGestures'
import { useLocale } from '@/hooks/useLocale'
import { photosService } from '@/services/photos'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { AddToAlbumDialog } from '@/components/albums/AddToAlbumDialog'
import { ShareDialog } from '@/components/share/ShareDialog'
import { ViewerToolbar } from './ViewerToolbar'
import { ViewerMedia } from './ViewerMedia'
import { InfoPanel } from './InfoPanel'

export interface PhotoViewerProps {
  items: Media[]
  photoId: number
  onNavigate: (id: number) => void
  onClose: () => void
  /** Chamado quando o utilizador se aproxima do fim da lista carregada. */
  onNearEnd?: () => void
  /** 'public' = página de partilha (sem detalhe, favoritos, etc.). */
  variant?: 'app' | 'public'
  /** URL de download para o modo público (pré-assinado; null = sem download). */
  publicDownloadUrl?: (item: Media) => string | null
}

function isTyping(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable
}

export function PhotoViewer({
  items,
  photoId,
  onNavigate,
  onClose,
  onNearEnd,
  variant = 'app',
  publicDownloadUrl,
}: PhotoViewerProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const isApp = variant === 'app'
  const contentRef = useRef<HTMLDivElement>(null)

  const index = items.findIndex((m) => m.id === photoId)
  const detailQuery = usePhotoDetail(photoId, isApp)
  const detail = detailQuery.data
  const item: Media | undefined = index >= 0 ? items[index] : detail
  const prev = index > 0 ? items[index - 1] : undefined
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : undefined

  const [infoOpen, setInfoOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [albumOpen, setAlbumOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const nested = confirmOpen || albumOpen || shareOpen

  const favourite = useToggleFavourite()
  const trash = useTrashPhoto()

  const goPrev = useCallback(() => prev && onNavigate(prev.id), [prev, onNavigate])
  const goNext = useCallback(() => next && onNavigate(next.id), [next, onNavigate])

  const gestures = useViewerGestures({ resetKey: photoId, onSwipeLeft: goNext, onSwipeRight: goPrev })
  const { zoomIn, zoomOut, rotate } = gestures

  useEffect(() => {
    if (onNearEnd && index >= 0 && index >= items.length - 3) onNearEnd()
  }, [index, items.length, onNearEnd])

  const toggleFullscreen = useCallback(() => {
    const el = contentRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void el.requestFullscreen?.().catch(() => undefined)
  }, [])

  const toggleFavourite = useCallback(() => {
    if (!item) return
    favourite.mutate(
      { id: item.id, value: !item.is_favourite },
      { onError: (e) => toast.error(errorMessage(e)) },
    )
  }, [item, favourite, errorMessage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (nested || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          goPrev()
          break
        case 'ArrowRight':
          e.preventDefault()
          goNext()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case '+':
        case '=':
          zoomIn()
          break
        case '-':
        case '_':
          zoomOut()
          break
        case 'r':
        case 'R':
          rotate()
          break
        case 'i':
        case 'I':
          if (isApp) setInfoOpen((v) => !v)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nested, goPrev, goNext, toggleFullscreen, zoomIn, zoomOut, rotate, isApp])

  const confirmTrash = () => {
    if (!item) return
    const neighbour = next ?? prev
    trash.mutate(item.id, {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.success(t('viewer.movedToTrash'))
        if (neighbour) onNavigate(neighbour.id)
        else onClose()
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const downloadUrl = !item
    ? null
    : isApp
      ? detail?.download_url ?? photosService.downloadUrl(item.id)
      : publicDownloadUrl?.(item) ?? null
  const can = detail?.can

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Content
          ref={contentRef}
          aria-describedby="viewer-help"
          className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            contentRef.current?.focus()
          }}
        >
          <DialogPrimitive.Title className="sr-only">{item?.name ?? t('viewer.title')}</DialogPrimitive.Title>
          <p id="viewer-help" className="sr-only">{t('viewer.keyboardHelp')}</p>

          {item && (
            <ViewerToolbar
              onBack={onClose}
              isVideo={item.type === 'video'}
              downloadUrl={downloadUrl}
              webUrl={isApp ? detail?.web_url : null}
              infoOpen={infoOpen}
              onInfo={isApp ? () => setInfoOpen((v) => !v) : undefined}
              favourite={item.is_favourite}
              onFavourite={isApp ? toggleFavourite : undefined}
              onShare={isApp && can?.share !== false ? () => setShareOpen(true) : undefined}
              onAddToAlbum={isApp && can?.add_to_album !== false ? () => setAlbumOpen(true) : undefined}
              onRotate={rotate}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
              onFullscreen={toggleFullscreen}
              onDelete={isApp && can?.trash !== false ? () => setConfirmOpen(true) : undefined}
            />
          )}

          <div
            className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
            {...(item?.type === 'image' ? gestures.handlers : {})}
          >
            {item ? (
              <ViewerMedia item={item} locale={locale} transform={gestures.transform} animate={!gestures.swiping} />
            ) : detailQuery.isLoading ? (
              <Spinner className="text-white/70" />
            ) : (
              <div className="text-white">
                <ErrorState error={detailQuery.error} />
              </div>
            )}
          </div>

          {prev && (
            <button
              type="button"
              onClick={goPrev}
              aria-label={t('viewer.previous')}
              className="absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 sm:block"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
          )}
          {next && (
            <button
              type="button"
              onClick={goNext}
              aria-label={t('viewer.next')}
              className={
                'absolute top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 sm:block ' +
                (infoOpen ? 'right-[25rem]' : 'right-2')
              }
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          )}

          {index >= 0 && items.length > 1 && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/80" aria-live="polite">
              {t('viewer.position', { current: index + 1, total: items.length })}
            </p>
          )}

          {isApp && infoOpen && item && (
            <InfoPanel
              item={item}
              detail={detail}
              loading={detailQuery.isLoading}
              error={detailQuery.error}
              locale={locale}
              onClose={() => setInfoOpen(false)}
            />
          )}

          {isApp && item && (
            <>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('viewer.confirmTrashTitle')}
                description={t('viewer.confirmTrashBody')}
                confirmLabel={t('viewer.moveToTrash')}
                destructive
                pending={trash.isPending}
                onConfirm={confirmTrash}
              />
              <AddToAlbumDialog open={albumOpen} onOpenChange={setAlbumOpen} mediaIds={[item.id]} />
              <ShareDialog open={shareOpen} onOpenChange={setShareOpen} target={{ type: 'media', media_ids: [item.id] }} />
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
