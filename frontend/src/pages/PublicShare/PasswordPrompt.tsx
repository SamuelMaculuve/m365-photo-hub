import { useId, useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'

export function PasswordPrompt({ wrong, pending, onSubmit }: { wrong: boolean; pending: boolean; onSubmit: (pw: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const [pw, setPw] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (pw) onSubmit(pw)
  }
  return (
    <form onSubmit={submit} className="mx-auto mt-16 flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-border bg-surface p-6 shadow-lg">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Lock className="size-5" aria-hidden="true" />
      </div>
      <h1 className="text-center text-lg font-semibold">{t('publicShare.passwordTitle')}</h1>
      <p className="text-center text-sm text-muted">{t('publicShare.passwordBody')}</p>
      <Label htmlFor={`${id}-pw`}>{t('share.password')}</Label>
      <Input id={`${id}-pw`} type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={wrong} />
      <FieldError message={wrong ? t('publicShare.wrongPassword') : undefined} />
      <Button type="submit" disabled={!pw || pending}>{t('publicShare.unlock')}</Button>
    </form>
  )
}
