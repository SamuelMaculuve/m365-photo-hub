import { useTranslation } from 'react-i18next'
import type { Album } from '@/types'
import { useCreateAlbum } from '@/hooks/useAlbums'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { AlbumForm } from './AlbumForm'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (album: Album) => void
}

export function CreateAlbumDialog({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation()
  const create = useCreateAlbum()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) create.reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('albums.createTitle')}</DialogTitle>
          <DialogDescription>{t('albums.createDescription')}</DialogDescription>
        </DialogHeader>
        {open && (
          <AlbumForm
            submitLabel={t('albums.create')}
            pending={create.isPending}
            error={create.error}
            onCancel={() => onOpenChange(false)}
            onSubmit={(values) =>
              create.mutate(values, {
                onSuccess: (album) => {
                  toast.success(t('albums.created', { name: album.name }))
                  onOpenChange(false)
                  onCreated?.(album)
                },
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
