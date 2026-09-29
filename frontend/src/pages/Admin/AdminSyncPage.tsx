import { useId, useState } from 'react'
import { FileText, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminLibraries, useStartSync, useSyncJobs, useSyncLogs, useSyncStatus } from '@/hooks/useAdmin'
import { useLocale } from '@/hooks/useLocale'
import { ApiError } from '@/services/api'
import { formatDateTime, formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { SyncJobProgress } from '@/components/admin/SyncJobProgress'
import { JobStatusBadge } from '@/components/admin/HealthBadge'

function StartSyncForm() {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const libraries = useAdminLibraries()
  const start = useStartSync()
  const [libraryId, setLibraryId] = useState('')
  const [full, setFull] = useState(false)
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{t('admin.sync.start')}</h2>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          start.mutate(
            { library_id: libraryId ? Number(libraryId) : undefined, full: full || undefined },
            {
              onSuccess: () => toast.success(t('admin.sync.started')),
              onError: (err) =>
                toast.error(err instanceof ApiError && err.status === 409 ? t('admin.sync.alreadyRunning') : errorMessage(err)),
            },
          )
        }}
      >
        <div className="flex min-w-56 flex-col gap-1.5">
          <Label htmlFor={`${id}-lib`}>{t('admin.sync.library')}</Label>
          <Select id={`${id}-lib`} value={libraryId} onChange={(e) => setLibraryId(e.target.value)}>
            <option value="">{t('admin.sync.allLibraries')}</option>
            {(libraries.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={full} onChange={(e) => setFull(e.target.checked)} />
          {t('admin.sync.full')}
        </label>
        <Button type="submit" disabled={start.isPending}><Play /> {t('admin.sync.startButton')}</Button>
      </form>
      <p className="mt-2 text-xs text-muted">{t('admin.sync.fullHint')}</p>
    </Card>
  )
}

function LogsDialog({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const logs = useSyncLogs(jobId)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('admin.sync.logsTitle', { id: jobId })}</DialogTitle>
          <DialogDescription className="sr-only">{t('admin.sync.logsTitle', { id: jobId })}</DialogDescription>
        </DialogHeader>
        {logs.isLoading ? (
          <Skeleton className="h-40" />
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={() => logs.refetch()} />
        ) : (logs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t('admin.sync.noLogs')}</p>
        ) : (
          <ul className="max-h-[60dvh] divide-y divide-border overflow-y-auto font-mono text-xs">
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-2 py-2">
                <Badge tone={l.level === 'error' ? 'danger' : l.level === 'warning' ? 'warning' : 'neutral'}>{l.level}</Badge>
                <span className="text-muted">{formatDateTime(l.created_at, locale)}</span>
                {l.code && <span className="text-muted">[{l.code}]</span>}
                <span className="w-full break-words">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AdminSyncPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const status = useSyncStatus()
  const running = (status.data?.running.length ?? 0) > 0
  const [page, setPage] = useState(1)
  const jobs = useSyncJobs(page, running)
  const [logJob, setLogJob] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <StartSyncForm />

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('admin.sync.running')}</h2>
        {status.isLoading ? (
          <Skeleton className="h-16" />
        ) : status.error ? (
          <ErrorState error={status.error} onRetry={() => status.refetch()} />
        ) : !running ? (
          <p className="text-sm text-muted">{t('admin.sync.idle')}</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {status.data!.running.map((j) => <li key={j.id}><SyncJobProgress job={j} /></li>)}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('admin.sync.drives')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('admin.sync.drive')}</th>
                <th className="py-2 pr-3 font-medium">{t('admin.sync.state')}</th>
                <th className="py-2 pr-3 font-medium">{t('admin.sync.lastCompleted')}</th>
                <th className="py-2 font-medium">{t('admin.sync.lastError')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(status.data?.drives ?? []).map((d) => (
                <tr key={d.id}>
                  <td className="py-2 pr-3 font-medium">{d.name}</td>
                  <td className="py-2 pr-3"><JobStatusBadge status={d.status} /></td>
                  <td className="py-2 pr-3 text-muted">{d.last_completed_at ? formatDateTime(d.last_completed_at, locale) : '—'}</td>
                  <td className="max-w-xs truncate py-2 text-danger" title={d.last_error ?? undefined}>{d.last_error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t('admin.sync.history')}</h2>
        {jobs.isLoading ? (
          <Skeleton className="h-32" />
        ) : jobs.error ? (
          <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.sync.drive')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.sync.type')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.sync.state')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.sync.processed')}</th>
                    <th className="py-2 pr-3 font-medium">{t('admin.sync.startedAt')}</th>
                    <th className="py-2"><span className="sr-only">{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(jobs.data?.data ?? []).map((j) => (
                    <tr key={j.id}>
                      <td className="py-2 pr-3 text-muted">{j.id}</td>
                      <td className="py-2 pr-3">{j.drive?.name ?? '—'}</td>
                      <td className="py-2 pr-3">{t(`admin.sync.types.${j.type}`, { defaultValue: j.type })}</td>
                      <td className="py-2 pr-3"><JobStatusBadge status={j.status} /></td>
                      <td className="py-2 pr-3">{formatNumber(j.processed, locale)}{j.errors > 0 && <span className="ml-1 text-danger">({t('admin.sync.errorCount', { count: j.errors })})</span>}</td>
                      <td className="py-2 pr-3 text-muted">{j.started_at ? formatDateTime(j.started_at, locale) : '—'}</td>
                      <td className="py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setLogJob(j.id)}><FileText /> {t('admin.sync.logs')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {jobs.data && jobs.data.meta.last_page > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
                <span className="text-muted">{t('common.pageOf', { page, total: jobs.data.meta.last_page })}</span>
                <Button variant="secondary" size="sm" disabled={page >= jobs.data.meta.last_page} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
              </div>
            )}
          </>
        )}
      </Card>
      {logJob != null && <LogsDialog jobId={logJob} onClose={() => setLogJob(null)} />}
    </div>
  )
}
