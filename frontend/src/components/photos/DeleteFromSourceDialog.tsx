import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export const CONFIRM_WORD = 'DELETE'

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  name: string
  pending?: boolean
  onConfirm: () => void
}

/** Confirmação forte: exige escrever DELETE. */
export function DeleteFromSourceDialog({ open, onOpenChange, name, pending, onConfirm }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [value, setValue] = useState('')
  const ok = value === CONFIRM_WORD
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setValue(''); onOpenChange(o) }}>
      <DialogContent role="alertdialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle className="size-5" aria-hidden="true" /> {t('trash.deleteSourceTitle')}
          </DialogTitle>
          <DialogDescription>{t('trash.deleteSourceBody', { name })}</DialogDescription>
        </DialogHeader>
        <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{t('trash.recycleBinNote')}</p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ok) onConfirm()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-confirm`}>{t('trash.typeToConfirm', { word: CONFIRM_WORD })}</Label>
            <Input id={`${id}-confirm`} value={value} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="danger" disabled={!ok || pending}>{t('trash.deleteSource')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
