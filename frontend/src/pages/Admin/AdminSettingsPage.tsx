import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminSettings } from '@/types'
import { useAdminSettings, useSaveAdminSettings } from '@/hooks/useAdmin'
import { ApiError } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { FacesPurgeCard } from '@/components/admin/FacesPurgeCard'
import { useCurrentUser } from '@/hooks/useAuth'

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-3 text-sm">
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  )
}

export default function AdminSettingsPage() {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const isSuperAdmin = useCurrentUser()?.role === 'super_admin'
  const q = useAdminSettings()
  const save = useSaveAdminSettings()
  const [s, setS] = useState<AdminSettings | null>(null)
  useEffect(() => {
    if (q.data) setS(q.data)
  }, [q.data])

  if (q.isLoading || (!s && !q.error)) return <Skeleton className="h-64 rounded-2xl" />
  if (q.error || !s) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const apiErr = save.error instanceof ApiError ? save.error : null

  return (
    <div className="flex flex-col gap-4">
    <Card className="max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(s, { onSuccess: () => toast.success(t('admin.settings.saved')), onError: (err) => toast.error(errorMessage(err)) })
        }}
      >
        <div className="divide-y divide-border">
          <ToggleRow label={t('admin.settings.publicLinks')} hint={t('admin.settings.publicLinksHint')} checked={s.public_links_enabled} onChange={(v) => setS({ ...s, public_links_enabled: v })} />
          <div className="flex flex-col gap-1.5 py-3">
            <Label htmlFor={`${id}-days`}>{t('admin.settings.maxShareDays')}</Label>
            <Input id={`${id}-days`} type="number" min={1} max={3650} className="w-32" value={s.max_share_days} onChange={(e) => setS({ ...s, max_share_days: Number(e.target.value) })} />
            <FieldError message={apiErr?.fieldError('max_share_days')} />
          </div>
          <ToggleRow label={t('admin.settings.ai')} hint={t('admin.settings.aiHint')} checked={s.ai_enabled} onChange={(v) => setS({ ...s, ai_enabled: v })} />
          <ToggleRow label={t('admin.settings.faces')} hint={t('admin.settings.facesHint')} checked={s.faces_enabled} onChange={(v) => setS({ ...s, faces_enabled: v })} />
          <div className="flex flex-col gap-1.5 py-3">
            <Label htmlFor={`${id}-gps`}>{t('admin.settings.gpsPrecision')}</Label>
            <Select id={`${id}-gps`} className="w-64" value={String(s.gps_precision)} onChange={(e) => setS({ ...s, gps_precision: /^\d+$/.test(e.target.value) ? Number(e.target.value) : e.target.value })}>
              <option value="6">{t('admin.settings.gps.exact')}</option>
              <option value="3">{t('admin.settings.gps.neighbourhood')}</option>
              <option value="2">{t('admin.settings.gps.city')}</option>
              <option value="0">{t('admin.settings.gps.hidden')}</option>
            </Select>
            <p className="text-xs text-muted">{t('admin.settings.gpsHint')}</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={save.isPending}>{t('common.save')}</Button>
        </div>
      </form>
    </Card>
    {isSuperAdmin && <FacesPurgeCard />}
    </div>
  )
}
