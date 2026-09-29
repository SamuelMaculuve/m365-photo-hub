import { useRouteError } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/states'

export function RouteError() {
  const { t } = useTranslation()
  const error = useRouteError()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <ErrorState error={error} />
      <Button onClick={() => window.location.assign('/')}>{t('notFound.back')}</Button>
    </div>
  )
}
