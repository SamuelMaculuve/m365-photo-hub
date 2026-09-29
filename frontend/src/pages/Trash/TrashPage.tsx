import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { useBulkAction, useTrash } from '@/hooks/usePhotos'
import { useSelection } from '@/hooks/useSelection'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'
import { PhotoGrid } from '@/components/photos/PhotoGrid'
import { GridSkeleton } from '@/components/photos/GridSkeleton'
import { SelectionBar } from '@/components/photos/SelectionBar'
import { TrashItemDialog } from '@/components/photos/TrashItemDialog'

export default function TrashPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const trash = useTrash()
  const selection = useSelection()
  const bulk = useBulkAction()
  const [current, setCurrent] = useState<Media | null>(null)

  const restoreSelected = () => {
    const ids = [...selection.ids]
    bulk.mutate(
      { action: 'restore', ids },
      {
        onSuccess: () => { toast.success(t('trash.restored', { count: ids.length })); selection.clear() },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <>
      <PageHeader title={t('trash.title')} description={t('trash.subtitle')} />
      <SelectionBar
        count={selection.count}
        onClear={selection.clear}
        busy={bulk.isPending}
        extra={
          <Tooltip content={t('trash.restore')}>
            <Button variant="ghost" size="icon" aria-label={t('trash.restore')} onClick={restoreSelected} disabled={bulk.isPending}>
              <RotateCcw />
            </Button>
          </Tooltip>
        }
      />
      {trash.isLoading ? (
        <GridSkeleton />
      ) : trash.error && trash.items.length === 0 ? (
        <ErrorState error={trash.error} onRetry={() => trash.refetch()} />
      ) : trash.items.length === 0 ? (
        <EmptyState icon={Trash2} title={t('trash.emptyTitle')} description={t('trash.emptyBody')} />
      ) : (
        <PhotoGrid
          items={trash.items}
          groupByDay={false}
          hasNextPage={trash.hasNextPage}
          isFetchingNextPage={trash.isFetchingNextPage}
          fetchNextPage={trash.fetchNextPage}
          onOpen={(i) => setCurrent(trash.items[i])}
          selectedIds={selection.ids}
          onToggleSelect={selection.toggle}
          label={t('trash.title')}
        />
      )}
      {current && <TrashItemDialog item={current} onClose={() => setCurrent(null)} />}
    </>
  )
}
