import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuthConfig, useDevLogin } from '@/hooks/useAuth'
import { MICROSOFT_LOGIN_URL } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { useErrorMessage } from '@/components/ui/states'
import { APP_NAME, BrandMark } from '@/components/layout/Brand'

const KNOWN_ERRORS = ['session_expired', 'access_denied', 'invalid_state', 'invalid_tenant', 'identity_taken', 'account_disabled', 'no_access']

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="size-5" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

function DevLoginForm() {
  const { t } = useTranslation()
  const id = useId()
  const [email, setEmail] = useState('')
  const devLogin = useDevLogin()
  const errorMessage = useErrorMessage()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (email.trim()) devLogin.mutate(email.trim())
  }
  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-2 rounded-xl border border-dashed border-border p-4 text-left">
      <p className="text-xs font-medium uppercase tracking-wide text-warning">{t('login.devTitle')}</p>
      <Label htmlFor={`${id}-email`}>{t('login.devEmail')}</Label>
      <div className="flex gap-2">
        <Input id={`${id}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Button type="submit" variant="secondary" disabled={devLogin.isPending}>{t('login.devSubmit')}</Button>
      </div>
      <FieldError message={devLogin.error ? errorMessage(devLogin.error) : undefined} />
    </form>
  )
}

export default function LoginPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const config = useAuthConfig()
  const error = params.get('error')
  const appName = config.data?.app_name || APP_NAME
  const errorKey = error ? (KNOWN_ERRORS.includes(error) ? `login.errors.${error}` : 'login.errors.generic') : null

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-accent-soft/60 via-background to-background px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
        <BrandMark className="mx-auto size-14 rounded-2xl" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{appName}</h1>
        <p className="mt-2 text-sm text-muted">{t('login.subtitle')}</p>

        {errorKey && (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-left text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t(errorKey)}</span>
          </div>
        )}

        <Button asChild size="lg" variant="secondary" className="mt-6 w-full">
          <a href={MICROSOFT_LOGIN_URL}>
            <MicrosoftLogo /> {t('login.microsoft')}
          </a>
        </Button>
        {config.data?.microsoft_configured === false && (
          <p className="mt-3 rounded-xl bg-warning-soft p-2 text-xs text-warning">{t('login.notConfigured')}</p>
        )}
        <p className="mt-4 text-xs text-muted">{t('login.hint')}</p>

        {config.data?.dev_login && <DevLoginForm />}
      </div>
    </main>
  )
}
