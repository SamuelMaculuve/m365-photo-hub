import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm text-warning">
      <WifiOff className="size-4" aria-hidden="true" />
      {t('offline.banner')}
    </div>
  )
}
