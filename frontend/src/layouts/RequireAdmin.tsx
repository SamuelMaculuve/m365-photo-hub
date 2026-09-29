import { Outlet } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/useAuth'
import { EmptyState } from '@/components/ui/states'

export default function RequireAdmin() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  if (!user?.permissions.admin) {
    return <EmptyState icon={ShieldAlert} title={t('errors.forbiddenTitle')} description={t('errors.forbidden')} />
  }
  return <Outlet />
}
