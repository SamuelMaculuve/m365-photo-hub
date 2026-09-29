import { useId, useState, type FormEvent } from 'react'
import { Building2, Globe, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Share, ShareAudience, UserSummary } from '@/types'
import { useCreateShare } from '@/hooks/useShares'
import { absoluteUrl } from '@/services/shares'
import { ApiError } from '@/services/api'
import { toDateInput } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useErrorMessage } from '@/components/ui/states'
import { UserPicker } from './UserPicker'
import { CopyField } from './CopyField'

export type ShareTarget = { type: 'media'; media_ids: number[] } | { type: 'album'; album_id: number }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: ShareTarget
}

const AUDIENCES: { value: ShareAudience; icon: typeof Users }[] = [
  { value: 'organisation', icon: Building2 },
  { value: 'users', icon: Users },
  { value: 'public', icon: Globe },
]

export function ShareDialog({ open, onOpenChange, target }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const create = useCreateShare()
  const [audience, setAudience] = useState<ShareAudience>('organisation')
  const [users, setUsers] = useState<UserSummary[]>([])
  const [expires, setExpires] = useState('')
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<Share | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const reset = () => {
    setAudience('organisation')
    setUsers([])
    setExpires('')
    setPassword('')
    setResult(null)
    setLocalError(null)
    create.reset()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (audience === 'users' && users.length === 0) {
      setLocalError(t('share.pickAtLeastOne'))
      return
    }
    setLocalError(null)
    create.mutate(
      {
        ...target,
        audience,
        user_ids: audience === 'users' ? users.map((u) => u.id) : undefined,
        expires_at: expires || null,
        password: audience === 'public' && password ? password : null,
      },
      { onSuccess: setResult },
    )
  }

  const apiErr = create.error instanceof ApiError ? create.error : null
  const tomorrow = toDateInput(new Date(Date.now() + 86_400_000))

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('share.title')}</DialogTitle>
          <DialogDescription>
            {target.type === 'album' ? t('share.descriptionAlbum') : t('share.descriptionMedia', { count: target.media_ids.length })}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-success" role="status">{t('share.created')}</p>
            <CopyField value={absoluteUrl(result.url)} label={t('share.link')} />
            {result.expires_at && <p className="text-xs text-muted">{t('share.expiresOn', { date: result.expires_at.slice(0, 10) })}</p>}
            <DialogFooter>
              <Button onClick={() => { reset(); onOpenChange(false) }}>{t('common.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t('share.audience')}</legend>
              {AUDIENCES.map(({ value, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                    audience === value ? 'border-accent bg-accent-soft/40' : 'border-border hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-audience`}
                    value={value}
                    checked={audience === value}
                    onChange={() => setAudience(value)}
                    className="mt-1 accent-[var(--accent)]"
                  />
                  <Icon className="mt-0.5 size-4 text-muted" aria-hidden="true" />
                  <span>
                    <span className="block text-sm font-medium">{t(`share.audiences.${value}`)}</span>
                    <span className="block text-xs text-muted">{t(`share.audiences.${value}Hint`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {audience === 'users' && <UserPicker value={users} onChange={setUsers} />}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-exp`}>{t('share.expiresAt')}</Label>
              <Input id={`${id}-exp`} type="date" min={tomorrow} value={expires} onChange={(e) => setExpires(e.target.value)} />
              <FieldError message={apiErr?.fieldError('expires_at')} />
            </div>

            {audience === 'public' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-pw`}>{t('share.password')}</Label>
                <Input id={`${id}-pw`} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <p className="text-xs text-muted">{t('share.passwordHint')}</p>
                <FieldError message={apiErr?.fieldError('password')} />
              </div>
            )}

            <FieldError message={localError ?? (create.error ? errorMessage(create.error) : undefined)} />

            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={create.isPending}>{t('share.createLink')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
