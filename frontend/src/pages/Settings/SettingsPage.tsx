import { useId } from 'react'
import { Library } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser, useUpdateLocale } from '@/hooks/useAuth'
import { useLibraries } from '@/hooks/usePlaces'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Label, Select } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'

export default function SettingsPage() {
  const { t } = useTranslation()
  const id = useId()
  const locale = useLocale()
  const user = useCurrentUser()
  const updateLocale = useUpdateLocale()
  const libraries = useLibraries()
  const errorMessage = useErrorMessage()

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <h2 className="mb-3 text-base font-semibold">{t('settings.language')}</h2>
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label htmlFor={`${id}-lang`}>{t('settings.languageLabel')}</Label>
            <Select
              id={`${id}-lang`}
              value={locale}
              disabled={updateLocale.isPending}
              onChange={(e) =>
                updateLocale.mutate(e.target.value as 'pt' | 'en', {
                  onSuccess: () => toast.success(t('settings.languageSaved')),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              <option value="pt">Português</option>
              <option value="en">English</option>
            </Select>
          </div>
        </Card>

        {user && (
          <Card>
            <h2 className="mb-3 text-base font-semibold">{t('settings.profile')}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-muted">{t('settings.name')}</dt><dd>{user.name}</dd></div>
              <div><dt className="text-muted">{t('settings.email')}</dt><dd className="break-all">{user.email}</dd></div>
              <div><dt className="text-muted">{t('settings.role')}</dt><dd>{t(`roles.${user.role}`)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">{t('settings.profileHint')}</p>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 text-base font-semibold">{t('settings.libraries')}</h2>
          {libraries.isLoading ? (
            <Skeleton className="h-16" />
          ) : libraries.error ? (
            <ErrorState error={libraries.error} onRetry={() => libraries.refetch()} />
          ) : (libraries.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">{t('settings.noLibraries')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {(libraries.data ?? []).map((l) => {
                const role = user?.libraries.find((x) => x.id === l.id)?.role
                return (
                  <li key={l.id} className="flex items-center gap-3 py-3">
                    <Library className="size-5 text-muted" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{l.name}</p>
                      {l.description && <p className="truncate text-xs text-muted">{l.description}</p>}
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>{t('settings.itemCount', { count: l.media_count, formatted: formatNumber(l.media_count, locale) })}</p>
                      {role && <p>{t(`roles.${role}`, { defaultValue: role })}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
