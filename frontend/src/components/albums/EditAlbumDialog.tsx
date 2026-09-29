import { useTranslation } from 'react-i18next'
import type { Album } from '@/types'
import { useUpdateAlbum } from '@/hooks/useAlbums'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { AlbumForm } from './AlbumForm'

export function EditAlbumDialog({ album, open, onOpenChange }: { album: Album; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation()
  const update = useUpdateAlbum(album.id)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('albums.editTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('albums.editTitle')}</DialogDescription>
        </DialogHeader>
        {open && (
          <AlbumForm
            initial={{ name: album.name, description: album.description ?? '', visibility: album.visibility }}
            submitLabel={t('common.save')}
            pending={update.isPending}
            error={update.error}
            onCancel={() => onOpenChange(false)}
            onSubmit={(values) =>
              update.mutate(values, {
                onSuccess: () => {
                  toast.success(t('albums.updated'))
                  onOpenChange(false)
                },
              })
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
