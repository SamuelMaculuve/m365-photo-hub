import { useTranslation } from 'react-i18next'
import type { SyncJob } from '@/types'
import { formatNumber, splitDuration } from '@/lib/format'
import { useLocale } from '@/hooks/useLocale'
import { Progress } from '@/components/ui/card'

export function useEtaLabel() {
  const { t } = useTranslation()
  return (seconds: number | null | undefined): string | null => {
    if (seconds == null || !Number.isFinite(seconds)) return null
    const { h, m, s } = splitDuration(seconds)
    if (h > 0) return t('admin.sync.etaHours', { h, m })
    if (m > 0) return t('admin.sync.etaMinutes', { m, s })
    return t('admin.sync.etaSeconds', { s })
  }
}

export function SyncJobProgress({ job }: { job: SyncJob }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const etaLabel = useEtaLabel()
  const percent =
    job.progress ?? (job.total_estimate ? Math.min(100, (job.processed / job.total_estimate) * 100) : 0)
  const eta = etaLabel(job.eta_seconds)
  const parts = [
    `${Math.round(percent)}%`,
    job.total_estimate
      ? t('admin.sync.filesOf', { processed: formatNumber(job.processed, locale), total: formatNumber(job.total_estimate, locale) })
      : t('admin.sync.files', { processed: formatNumber(job.processed, locale) }),
    eta ? t('admin.sync.remaining', { eta }) : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {t('admin.sync.syncing')} <span className="text-muted">{job.drive?.name}</span>
        </p>
        <p className="text-xs text-muted">{t(`admin.sync.types.${job.type}`, { defaultValue: job.type })}</p>
      </div>
      <Progress value={percent} label={t('admin.sync.syncing')} />
      <p className="text-xs text-muted" aria-live="polite">{parts.join(' · ')}</p>
      <p className="text-xs text-muted">
        {t('admin.sync.counters', { created: job.created, updated: job.updated, removed: job.removed, errors: job.errors })}
      </p>
    </div>
  )
}
