import { Link } from 'react-router'
import { SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/states'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <EmptyState
      icon={SearchX}
      title={t('notFound.title')}
      description={t('notFound.body')}
      action={<Button asChild><Link to="/">{t('notFound.back')}</Link></Button>}
    />
  )
}
