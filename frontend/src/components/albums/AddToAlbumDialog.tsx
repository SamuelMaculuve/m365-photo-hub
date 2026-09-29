import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAddToAlbum, useAlbums, useCreateAlbum } from '@/hooks/useAlbums'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { AlbumCover } from './AlbumCover'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaIds: number[]
  onDone?: () => void
}

export function AddToAlbumDialog({ open, onOpenChange, mediaIds, onDone }: Props) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const debounced = useDebouncedValue(q, 250)
  const albums = useAlbums(open ? debounced : undefined)
  const add = useAddToAlbum()
  const create = useCreateAlbum()

  const finish = (name: string) => {
    toast.success(t('albums.addedTo', { count: mediaIds.length, name }))
    onOpenChange(false)
    setQ('')
    setNewName('')
    onDone?.()
  }

  const addTo = (albumId: number, name: string) =>
    add.mutate({ albumId, mediaIds }, { onSuccess: () => finish(name), onError: (e) => toast.error(errorMessage(e)) })

  const createAndAdd = () => {
    const name = newName.trim()
    if (!name) return
    create.mutate(
      { name },
      { onSuccess: (album) => addTo(album.id, album.name), onError: (e) => toast.error(errorMessage(e)) },
    )
  }

  const busy = add.isPending || create.isPending
  const list = (albums.data?.data ?? []).filter((a) => a.can?.update !== false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('albums.addToTitle')}</DialogTitle>
          <DialogDescription>{t('albums.addToDescription', { count: mediaIds.length })}</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            createAndAdd()
          }}
        >
          <Input
            aria-label={t('albums.newAlbumName')}
            placeholder={t('albums.newAlbumName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button type="submit" disabled={busy || !newName.trim()}>
            <Plus /> {t('albums.create')}
          </Button>
        </form>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input className="pl-9" aria-label={t('albums.searchAlbums')} placeholder={t('albums.searchAlbums')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {albums.isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          )}
          {albums.error && <ErrorState error={albums.error} onRetry={() => albums.refetch()} />}
          {!albums.isLoading && list.length === 0 && !albums.error && (
            <p className="py-6 text-center text-sm text-muted">{t('albums.none')}</p>
          )}
          <ul className="flex flex-col gap-1">
            {list.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => addTo(a.id, a.name)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2 disabled:opacity-50"
                >
                  <AlbumCover album={a} className="size-12 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{a.name}</span>
                    <span className="block text-xs text-muted">{t('albums.itemCount', { count: a.media_count })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  )
}
