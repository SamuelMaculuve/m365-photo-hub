import { useTranslation } from 'react-i18next'
import type { HealthStatus } from '@/types'
import { Badge } from '@/components/ui/card'

const TONE = { healthy: 'success', degraded: 'warning', error: 'danger' } as const

export function HealthBadge({ status }: { status: HealthStatus }) {
  const { t } = useTranslation()
  return (
    <Badge tone={TONE[status] ?? 'neutral'}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {t(`admin.health.${status}`)}
    </Badge>
  )
}

export function JobStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const tone =
    status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'running' ? 'accent' : 'neutral'
  return <Badge tone={tone}>{t(`admin.sync.status.${status}`, { defaultValue: status })}</Badge>
}
