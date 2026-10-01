import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
import { Link2, Unlink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CurrentUser } from '@/types'
import { useUnlinkIdentity } from '@/hooks/useAuth'
import { useLocale } from '@/hooks/useLocale'
import { formatDateTime } from '@/lib/format'
import { MICROSOFT_LINK_URL } from '@/services/auth'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { OrganizationBadge } from '@/components/ui/organization-badge'
import { useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'

/** Contas Microsoft ligadas ao perfil — uma por organização (ex.: @h2n.org.mz e @tvsurdo.com). */
export function LinkedAccountsCard({ user }: { user: CurrentUser }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const [params, setParams] = useSearchParams()
  const unlink = useUnlinkIdentity()
  const identities = user.identities ?? []

  // Resultado do regresso da Microsoft depois de ligar uma conta.
  useEffect(() => {
    const linkError = params.get('link_error')
    if (params.get('linked')) toast.success(t('settings.accounts.linked'))
    else if (linkError) toast.error(t(`settings.accounts.errors.${linkError}`, { defaultValue: t('settings.accounts.errors.login_failed') }))
    else return
    setParams({}, { replace: true })
  }, [params, setParams, t])

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{t('settings.accounts.title')}</h2>
          <p className="text-sm text-muted">{t('settings.accounts.body')}</p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <a href={MICROSOFT_LINK_URL}>
            <Link2 /> {t('settings.accounts.link')}
          </a>
        </Button>
      </div>
      {identities.length === 0 ? (
        <p className="text-sm text-muted">{t('settings.accounts.none')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {identities.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.email ?? '—'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {i.organization && <OrganizationBadge organization={i.organization} />}
                  {i.last_login_at && <span>{t('settings.accounts.lastUsed', { date: formatDateTime(i.last_login_at, locale) })}</span>}
                </div>
              </div>
              {identities.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={unlink.isPending}
                  aria-label={t('settings.accounts.unlinkFor', { email: i.email ?? '' })}
                  onClick={() =>
                    unlink.mutate(i.id, {
                      onSuccess: () => toast.success(t('settings.accounts.unlinked')),
                      onError: (e) => toast.error(errorMessage(e)),
                    })
                  }
                >
                  <Unlink /> {t('settings.accounts.unlink')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
