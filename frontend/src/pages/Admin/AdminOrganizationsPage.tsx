import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Building2, Check, Copy, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminOrganizations, useCreateOrganization, useUpdateOrganization } from '@/hooks/useAdmin'
import { useCopy } from '@/hooks/useCopy'
import { useLocale } from '@/hooks/useLocale'
import { formatDateTime } from '@/lib/format'
import { ApiError } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { OrganizationBadge } from '@/components/ui/organization-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

/** Organizações (tenants Microsoft 365) cujas contas podem entrar e cujos sites podem ser sincronizados. */
export default function AdminOrganizationsPage() {
  const { t } = useTranslation()
  const id = useId()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const [params, setParams] = useSearchParams()
  const organizations = useAdminOrganizations()
  const create = useCreateOrganization()
  const update = useUpdateOrganization()
  const copy = useCopy()
  const [tenant, setTenant] = useState('')
  const [name, setName] = useState('')

  // Regresso do ecrã de consentimento de administrador da Microsoft.
  useEffect(() => {
    if (params.get('consented')) toast.success(t('admin.organizations.consented'))
    else if (params.get('consent_error')) toast.error(t('admin.organizations.consentError'))
    else return
    setParams({}, { replace: true })
  }, [params, setParams, t])

  const apiErr = create.error instanceof ApiError ? create.error : null

  const submit = () =>
    create.mutate(
      { tenant: tenant.trim(), name: name.trim() },
      {
        onSuccess: () => {
          toast.success(t('admin.organizations.created'))
          setTenant('')
          setName('')
        },
      },
    )

  const toggle = (orgId: number, input: { enabled?: boolean; trust_app_roles?: boolean }) =>
    update.mutate({ id: orgId, ...input }, { onSuccess: () => toast.success(t('admin.organizations.saved')), onError: (e) => toast.error(errorMessage(e)) })

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold">{t('admin.organizations.addTitle')}</h2>
          <p className="text-sm text-muted">{t('admin.organizations.addBody')}</p>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-tenant`}>{t('admin.organizations.tenant')}</Label>
            <Input id={`${id}-tenant`} value={tenant} placeholder="tvsurdo.com" onChange={(e) => setTenant(e.target.value)} aria-invalid={!!apiErr?.fieldError('tenant')} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-name`}>{t('admin.organizations.name')}</Label>
            <Input id={`${id}-name`} value={name} placeholder="TV Surdo" onChange={(e) => setName(e.target.value)} aria-invalid={!!apiErr?.fieldError('name')} />
          </div>
          <Button type="submit" disabled={create.isPending || !tenant.trim() || !name.trim()}>{t('admin.organizations.add')}</Button>
        </form>
        <FieldError message={apiErr?.fieldError('tenant') ?? apiErr?.fieldError('name') ?? (create.error ? errorMessage(create.error) : undefined)} />
      </Card>

      {organizations.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : organizations.error ? (
        <ErrorState error={organizations.error} onRetry={() => organizations.refetch()} />
      ) : !organizations.data?.length ? (
        <EmptyState icon={Building2} title={t('admin.organizations.emptyTitle')} description={t('admin.organizations.emptyBody')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {organizations.data.map((o) => (
            <li key={o.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <OrganizationBadge organization={o} className="text-sm text-foreground" />
                    <p className="mt-1 break-all font-mono text-xs text-muted">{o.tenant_id}</p>
                    {o.domains.length > 0 && <p className="text-xs text-muted">{o.domains.join(', ')}</p>}
                  </div>
                  <p className="text-xs text-muted">
                    {t('admin.organizations.counts', { accounts: o.identities_count, drives: o.drives_count })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {o.consented_at ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="size-4" aria-hidden="true" />
                      {t('admin.organizations.consentedAt', { date: formatDateTime(o.consented_at, locale) })}
                    </span>
                  ) : (
                    <span className="text-warning">{t('admin.organizations.consentPending')}</span>
                  )}
                  <Button variant="secondary" size="sm" asChild>
                    <a href={o.admin_consent_url}>
                      <ExternalLink /> {t('admin.organizations.grantConsent')}
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void copy(o.admin_consent_url)}>
                    <Copy /> {t('admin.organizations.copyConsent')}
                  </Button>
                </div>

                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    <span className="block font-medium">{t('admin.organizations.enabled')}</span>
                    <span className="block text-xs text-muted">{t('admin.organizations.enabledHint')}</span>
                  </span>
                  <Switch checked={o.enabled} disabled={update.isPending} onCheckedChange={(v) => toggle(o.id, { enabled: v })} aria-label={t('admin.organizations.enabled')} />
                </label>
                <label className="flex items-center justify-between gap-4 text-sm">
                  <span>
                    <span className="block font-medium">{t('admin.organizations.trustRoles')}</span>
                    <span className="block text-xs text-muted">{t('admin.organizations.trustRolesHint')}</span>
                  </span>
                  <Switch checked={o.trust_app_roles} disabled={update.isPending} onCheckedChange={(v) => toggle(o.id, { trust_app_roles: v })} aria-label={t('admin.organizations.trustRoles')} />
                </label>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
