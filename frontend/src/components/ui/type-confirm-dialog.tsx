import { useId, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Input, Label } from './input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'

interface TypeConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  /** Aviso adicional destacado (opcional). */
  warning?: ReactNode
  /** Palavra que o utilizador tem de escrever exactamente (ex.: EXCLUIR, APAGAR). */
  word: string
  confirmLabel: string
  pending?: boolean
  onConfirm: () => void
}

/** Confirmação forte para acções destrutivas: exige escrever uma palavra. */
export function TypeConfirmDialog({ open, onOpenChange, title, description, warning, word, confirmLabel, pending, onConfirm }: TypeConfirmDialogProps) {
  const { t } = useTranslation()
  const id = useId()
  const [value, setValue] = useState('')
  const ok = value === word
  const change = (o: boolean) => {
    if (!o) setValue('')
    onOpenChange(o)
  }
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent role="alertdialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-danger">
            <AlertTriangle className="size-5" aria-hidden="true" /> {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {warning && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">{warning}</p>}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ok && !pending) onConfirm()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-confirm`}>{t('common.typeToConfirm', { word })}</Label>
            <Input id={`${id}-confirm`} value={value} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setValue(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => change(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="danger" disabled={!ok || pending}>{confirmLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
