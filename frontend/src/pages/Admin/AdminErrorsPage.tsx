import { CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminErrors } from '@/hooks/useAdmin'
import { useLocale } from '@/hooks/useLocale'
import { formatDateTime } from '@/lib/format'
import { Badge, Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'

export default function AdminErrorsPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const q = useAdminErrors()
  if (q.isLoading) return <Skeleton className="h-40 rounded-2xl" />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data?.length) return <EmptyState icon={CheckCircle2} title={t('admin.errors.emptyTitle')} description={t('admin.errors.emptyBody')} />
  return (
    <Card>
      <ul className="divide-y divide-border">
        {q.data.map((e) => (
          <li key={e.id} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="danger">{e.level ?? 'error'}</Badge>
              {e.source && <Badge>{e.source}</Badge>}
              {e.code && <span className="font-mono text-muted">{e.code}</span>}
              <span className="ml-auto text-muted">{formatDateTime(e.created_at, locale)}</span>
            </div>
            <p className="break-words text-sm">{e.message}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}
