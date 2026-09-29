import { ScanFace } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useFacesStatus } from '@/hooks/useAdmin'
import { useFacesEnabled } from '@/hooks/usePeople'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Card } from '@/components/ui/card'

/** Estado do reconhecimento facial (só quando activo). */
export function FacesStatusCard() {
  const { t } = useTranslation()
  const locale = useLocale()
  const featureOn = useFacesEnabled()
  const q = useFacesStatus()
  const s = q.data
  if (!s || !(featureOn || s.enabled)) return null
  const n = (v: number) => formatNumber(v, locale)
  const stats = [
    { key: 'people', value: s.people },
    { key: 'faces', value: s.faces },
    { key: 'scanned', value: s.scanned },
    { key: 'pending', value: s.pending },
  ] as const
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <ScanFace className="size-5 text-muted" aria-hidden="true" /> {t('admin.faces.statusTitle')}
        </h2>
        <span className={s.available ? 'text-sm text-success' : 'text-sm text-warning'}>
          {s.available ? t('admin.faces.available') : t('admin.faces.unavailable')}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((x) => (
          <div key={x.key}>
            <dt className="text-sm text-muted">{t(`admin.faces.${x.key}`)}</dt>
            <dd className="text-2xl font-semibold tracking-tight">{n(x.value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
