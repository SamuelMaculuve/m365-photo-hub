import { useState } from 'react'
import { Search, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Person } from '@/types'
import { usePeople } from '@/hooks/usePeople'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { PersonAvatar } from './PersonAvatar'

interface MergePersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  person: Person
  pending?: boolean
  onConfirm: (intoId: number) => void
}

/** Escolher a pessoa para a qual esta será juntada. */
export function MergePersonDialog({ open, onOpenChange, person, pending, onConfirm }: MergePersonDialogProps) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const debounced = useDebouncedValue(q, 300)
  const people = usePeople({ q: debounced || undefined }, open)
  const list = (people.data ?? []).filter((p) => p.id !== person.id)

  const change = (o: boolean) => {
    if (!o) {
      setQ('')
      setSelected(null)
    }
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('people.mergeTitle')}</DialogTitle>
          <DialogDescription>{t('people.mergeBody', { name: person.name ?? t('people.unnamed') })}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input className="pl-9" type="search" aria-label={t('people.search')} placeholder={t('people.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {people.isLoading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-full" />)}
          </div>
        ) : people.error ? (
          <ErrorState error={people.error} onRetry={() => people.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={Users} title={t('people.noResults')} />
        ) : (
          <ul aria-label={t('people.mergePick')} className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4">
            {list.map((p) => {
              const name = p.name ?? t('people.unnamed')
              const isSel = selected === p.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setSelected(p.id)}
                    className={cn(
                      'flex w-full flex-col items-center gap-1.5 rounded-xl p-2 text-center text-xs focus-visible:outline-2 focus-visible:outline-ring',
                      isSel ? 'bg-accent-soft text-accent' : 'hover:bg-surface-2',
                    )}
                  >
                    <PersonAvatar src={p.thumbnail} alt={name} className={cn('size-16', isSel && 'ring-2 ring-accent')} />
                    <span className={cn('w-full truncate', !p.name && 'text-muted')}>{name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => change(false)}>{t('common.cancel')}</Button>
          <Button disabled={selected == null || pending} onClick={() => selected != null && onConfirm(selected)}>
            {t('people.mergeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
