import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePurgeFaces } from '@/hooks/useAdmin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { TypeConfirmDialog } from '@/components/ui/type-confirm-dialog'

const PURGE_WORD = 'APAGAR'

/** Zona de perigo: apagar todos os dados faciais (super_admin). */
export function FacesPurgeCard() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const purge = usePurgeFaces()
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex max-w-2xl flex-wrap items-center justify-between gap-4 border-danger/40">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-danger">{t('admin.faces.purgeTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.faces.purgeHint')}</p>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 /> {t('admin.faces.purge')}
      </Button>
      <TypeConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('admin.faces.purgeConfirmTitle')}
        description={t('admin.faces.purgeConfirmBody')}
        word={PURGE_WORD}
        confirmLabel={t('admin.faces.purge')}
        pending={purge.isPending}
        onConfirm={() =>
          purge.mutate(undefined, {
            onSuccess: () => {
              setOpen(false)
              toast.success(t('admin.faces.purged'))
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Card>
  )
}
