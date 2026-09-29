import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'

export function FullPageSpinner() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label={t('common.loading')} />
    </div>
  )
}
