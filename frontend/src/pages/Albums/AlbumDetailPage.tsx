import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ImageMinus, ImageIcon, MoreVertical, Pencil, Share2, Trash2, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAlbum, useAlbumMedia, useDeleteAlbum, useRemoveFromAlbum, useUpdateAlbum } from '@/hooks/useAlbums'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'
import { MediaBrowser } from '@/components/photos/MediaBrowser'
import { EditAlbumDialog } from '@/components/albums/EditAlbumDialog'
import { ShareDialog } from '@/components/share/ShareDialog'

export default function AlbumDetailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const albumId = Number(useParams().id)
  const album = useAlbum(albumId)
  const media = useAlbumMedia(albumId)
  const update = useUpdateAlbum(albumId)
  const remove = useRemoveFromAlbum(albumId)
  const del = useDeleteAlbum()
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (album.isLoading) return <Skeleton className="h-10 w-64" />
  if (album.error || !album.data) return <ErrorState error={album.error} onRetry={() => album.refetch()} />
  const a = album.data

  const setCover = (id: number, clear: () => void) =>
    update.mutate(
      { cover_media_id: id },
      { onSuccess: () => { toast.success(t('albums.coverSet')); clear() }, onError: (e) => toast.error(errorMessage(e)) },
    )

  const removeItems = (ids: number[], clear: () => void) =>
    remove.mutate(ids, {
      onSuccess: () => { toast.success(t('albums.removed', { count: ids.length })); clear() },
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <>
      <div className="mb-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/albums"><ArrowLeft /> {t('albums.title')}</Link>
        </Button>
      </div>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-5">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{a.name}</h1>
          {a.description && <p className="mt-1 max-w-2xl text-sm text-muted">{a.description}</p>}
          <p className="mt-2 text-xs text-muted">
            {t('albums.itemCount', { count: a.media_count })} · {t('albums.ownedBy', { name: a.owner.name })}
          </p>
        </div>
        <div className="flex gap-2">
          {a.can.share && (
            <Button variant="secondary" onClick={() => setShareOpen(true)}>
              <Share2 /> {t('common.share')}
            </Button>
          )}
          {(a.can.update || a.can.delete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={t('common.moreActions')}><MoreVertical /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {a.can.update && (
                  <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil /> {t('albums.edit')}</DropdownMenuItem>
                )}
                {a.can.update && a.cover && (
                  <DropdownMenuItem onSelect={() => update.mutate({ cover_media_id: null })}><ImageIcon /> {t('albums.clearCover')}</DropdownMenuItem>
                )}
                {a.can.delete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive onSelect={() => setDeleteOpen(true)}><Trash2 /> {t('albums.delete')}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      <MediaBrowser
        query={media}
        groupByDay={false}
        allowTrash={false}
        label={a.name}
        empty={<EmptyState icon={ImageIcon} title={t('albums.emptyAlbumTitle')} description={t('albums.emptyAlbumBody')} />}
        selectionExtra={(ids, clear) =>
          a.can.update ? (
            <>
              {ids.length === 1 && (
                <Tooltip content={t('albums.setCover')}>
                  <Button variant="ghost" size="icon" aria-label={t('albums.setCover')} onClick={() => setCover(ids[0], clear)}><Star /></Button>
                </Tooltip>
              )}
              <Tooltip content={t('albums.removeFromAlbum')}>
                <Button variant="ghost" size="icon" aria-label={t('albums.removeFromAlbum')} onClick={() => removeItems(ids, clear)}><ImageMinus /></Button>
              </Tooltip>
            </>
          ) : null
        }
      />

      <EditAlbumDialog album={a} open={editOpen} onOpenChange={setEditOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} target={{ type: 'album', album_id: a.id }} />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('albums.deleteTitle', { name: a.name })}
        description={t('albums.deleteBody')}
        confirmLabel={t('albums.delete')}
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(a.id, {
            onSuccess: () => { toast.success(t('albums.deleted')); navigate('/albums', { replace: true }) },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  )
}
