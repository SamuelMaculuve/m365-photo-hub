import { Activity, AlertTriangle, Album, Clock, HardDrive, Hourglass, Image, Sparkles, Users, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminDashboard } from '@/hooks/useAdmin'
import { useLocale } from '@/hooks/useLocale'
import { formatBytes, formatDateTime, formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'
import { StatCard } from '@/components/admin/StatCard'
import { HealthBadge } from '@/components/admin/HealthBadge'
import { FacesStatusCard } from '@/components/admin/FacesStatusCard'

export default function AdminDashboardPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const q = useAdminDashboard()
  if (q.isLoading) {
    return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
  }
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const d = q.data
  const n = (v: number) => formatNumber(v, locale)
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Activity className="size-5 text-muted" aria-hidden="true" />
          <span className="font-medium">{t('admin.dashboard.health')}</span>
          <HealthBadge status={d.status} />
        </div>
        <p className="text-sm text-muted">
          {d.last_sync_at ? t('admin.dashboard.lastSync', { date: formatDateTime(d.last_sync_at, locale) }) : t('admin.dashboard.neverSynced')}
        </p>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Image} label={t('admin.dashboard.photos')} value={n(d.photos)} />
        <StatCard icon={Video} label={t('admin.dashboard.videos')} value={n(d.videos)} />
        <StatCard icon={Album} label={t('admin.dashboard.albums')} value={n(d.albums)} />
        <StatCard icon={Users} label={t('admin.dashboard.users')} value={n(d.users)} />
        <StatCard icon={HardDrive} label={t('admin.dashboard.storage')} value={formatBytes(d.storage_bytes, locale)} hint={t('admin.dashboard.storageHint')} />
        <StatCard icon={AlertTriangle} label={t('admin.dashboard.syncErrors')} value={n(d.sync_errors_24h)} />
        <StatCard icon={Hourglass} label={t('admin.dashboard.unprocessed')} value={n(d.unprocessed)} />
        <StatCard icon={Clock} label={t('admin.dashboard.runningJobs')} value={n(d.running_jobs)} />
        <StatCard icon={Sparkles} label={t('admin.dashboard.ai')} value={d.ai_enabled ? t('common.enabled') : t('common.disabled')} />
      </div>
      <FacesStatusCard />
    </div>
  )
}
