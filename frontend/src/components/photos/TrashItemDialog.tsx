import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { useDeleteFromSource, usePhotoDetail, useRestorePhoto } from '@/hooks/usePhotos'
import { useLocale } from '@/hooks/useLocale'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { mediaAlt } from './PhotoTile'
import { DeleteFromSourceDialog } from './DeleteFromSourceDialog'

export function TrashItemDialog({ item, onClose }: { item: Media; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const detail = usePhotoDetail(item.id)
  const restore = useRestorePhoto()
  const destroy = useDeleteFromSource()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const canDelete = detail.data?.can.delete_from_source === true

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="truncate">{item.name}</DialogTitle>
          <DialogDescription>{formatDate(item.taken_at ?? item.sort_at, locale)}</DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-xl bg-surface-2">
          <img src={item.thumbnails.large} alt={mediaAlt(item, locale)} className="max-h-[50dvh] w-full object-contain" />
        </div>
        <p className="text-sm text-muted">{t('trash.itemHint')}</p>
        <DialogFooter>
          {canDelete && (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> {t('trash.deleteSource')}
            </Button>
          )}
          <Button
            disabled={restore.isPending}
            onClick={() =>
              restore.mutate(item.id, {
                onSuccess: () => { toast.success(t('trash.restored', { count: 1 })); onClose() },
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <RotateCcw /> {t('trash.restore')}
          </Button>
        </DialogFooter>
        <DeleteFromSourceDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          name={item.name}
          pending={destroy.isPending}
          onConfirm={() =>
            destroy.mutate(item.id, {
              onSuccess: () => { toast.success(t('trash.deletedFromSource')); setConfirmOpen(false); onClose() },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      </DialogContent>
    </Dialog>
  )
}
