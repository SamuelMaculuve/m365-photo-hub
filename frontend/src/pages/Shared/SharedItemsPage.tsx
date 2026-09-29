import { Link, useParams } from 'react-router'
import { ArrowLeft, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { sharesService } from '@/services/shares'
import { ApiError } from '@/services/api'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { GridSkeleton } from '@/components/photos/GridSkeleton'
import { ShareContent } from '@/components/share/ShareContent'

/** Partilha recebida: GET /api/shares/{id}/items. */
export default function SharedItemsPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const q = useQuery({ queryKey: ['shared-items', id], queryFn: () => sharesService.items(id), enabled: Number.isFinite(id) })
  const err = q.error instanceof ApiError ? q.error : null
  return (
    <>
      <div className="mb-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/shared"><ArrowLeft /> {t('shared.title')}</Link>
        </Button>
      </div>
      {q.isLoading ? (
        <GridSkeleton />
      ) : err?.status === 410 ? (
        <EmptyState icon={Clock} title={t('publicShare.expiredTitle')} description={t('publicShare.expiredBody')} />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ShareContent share={q.data} />
      )}
    </>
  )
}
