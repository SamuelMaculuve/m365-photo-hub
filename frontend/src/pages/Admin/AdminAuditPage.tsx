import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuditFilters } from '@/services/admin'
import { useAuditLogs } from '@/hooks/useAdmin'
import { useLocale } from '@/hooks/useLocale'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'

export default function AdminAuditPage() {
  const { t } = useTranslation()
  const id = useId()
  const locale = useLocale()
  const [filters, setFilters] = useState<AuditFilters>({})
  const [draft, setDraft] = useState<{ action: string; user_id: string; from: string; to: string }>({ action: '', user_id: '', from: '', to: '' })
  const logs = useAuditLogs(filters)
  const rows = logs.data?.pages.flatMap((p) => p.data) ?? []

  const apply = (e: FormEvent) => {
    e.preventDefault()
    setFilters({
      action: draft.action.trim() || undefined,
      user_id: draft.user_id ? Number(draft.user_id) : undefined,
      from: draft.from || undefined,
      to: draft.to || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <form onSubmit={apply} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t('search.filters')}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-action`}>{t('admin.audit.action')}</Label>
            <Input id={`${id}-action`} value={draft.action} placeholder="share.create" onChange={(e) => setDraft({ ...draft, action: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-user`}>{t('admin.audit.userId')}</Label>
            <Input id={`${id}-user`} inputMode="numeric" value={draft.user_id} onChange={(e) => setDraft({ ...draft, user_id: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-from`}>{t('filters.from')}</Label>
            <Input id={`${id}-from`} type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-to`}>{t('filters.to')}</Label>
            <Input id={`${id}-to`} type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="flex items-end"><Button type="submit" className="w-full">{t('filters.apply')}</Button></div>
        </form>
      </Card>
      <Card>
        {logs.isLoading ? (
          <Skeleton className="h-40" />
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.audit.empty')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t('admin.audit.when')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.audit.user')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.audit.action')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.audit.subject')}</th>
                    <th className="py-2 font-medium">{t('admin.audit.result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatDateTime(r.created_at, locale)}</td>
                      <td className="py-2 pr-3">{r.user?.name ?? t('admin.audit.system')}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{r.action}</td>
                      <td className="py-2 pr-3 text-muted">{r.subject_type ? `${r.subject_type} #${r.subject_id ?? ''}` : '—'}</td>
                      <td className="py-2">
                        <Badge tone={r.result === 'success' ? 'success' : r.result === 'denied' ? 'warning' : 'danger'}>
                          {t(`admin.audit.results.${r.result}`, { defaultValue: r.result })}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {logs.hasNextPage && (
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" disabled={logs.isFetchingNextPage} onClick={() => logs.fetchNextPage()}>
                  {t('common.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
