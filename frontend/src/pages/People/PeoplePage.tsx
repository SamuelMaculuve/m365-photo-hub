import { useState } from 'react'
import { Search, ShieldCheck, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCanEditPeople, useFacesEnabled, usePeople } from '@/hooks/usePeople'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { PersonCard } from '@/components/people/PersonCard'

const GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8'

function PeopleGrid() {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const debounced = useDebouncedValue(q.trim(), 300)
  const people = usePeople({ q: debounced || undefined, hidden: showHidden || undefined })
  const list = people.data ?? []
  const editorRole = useCanEditPeople()
  const canEdit = editorRole || showHidden || list.some((p) => p.can.update)

  return (
    <>
      <PageHeader
        title={t('people.title')}
        description={t('people.subtitle')}
        actions={
          <>
            {canEdit && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={showHidden} onCheckedChange={setShowHidden} aria-label={t('people.showHidden')} />
                <span>{t('people.showHidden')}</span>
              </label>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input className="w-56 pl-9" type="search" aria-label={t('people.search')} placeholder={t('people.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </>
        }
      />
      {people.isLoading ? (
        <div className={GRID}>
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-2">
              <Skeleton className="size-24 rounded-full sm:size-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : people.error ? (
        <ErrorState error={people.error} onRetry={() => people.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Users}
          title={debounced ? t('people.noResults') : t('people.emptyTitle')}
          description={debounced ? undefined : t('people.emptyBody')}
        />
      ) : (
        <ul className={GRID} aria-label={t('people.title')}>
          {list.map((p) => (
            <li key={p.id}><PersonCard person={p} /></li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function PeoplePage() {
  const { t } = useTranslation()
  const enabled = useFacesEnabled()
  if (enabled) return <PeopleGrid />
  return (
    <>
      <PageHeader title={t('people.title')} />
      <EmptyState icon={ShieldCheck} title={t('people.disabledTitle')} description={t('people.disabledBody')} />
    </>
  )
}
