import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from 'react-i18next'

export function GridSkeleton({ count = 24 }: { count?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-label={t('common.loading')}>
      <Skeleton className="mb-4 h-7 w-48" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {Array.from({ length: count }, (_, i) => (
          <Skeleton key={i} className="aspect-square rounded-md" />
        ))}
      </div>
    </div>
  )
}
