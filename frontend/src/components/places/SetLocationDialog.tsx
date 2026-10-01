import { useMemo, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePlaceCatalog, useSetLocation } from '@/hooks/useLocation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaIds: number[]
  onDone?: () => void
}

/** Atribuição manual de local a uma ou mais fotografias (ex.: câmaras sem GPS). */
export function SetLocationDialog({ open, onOpenChange, mediaIds, onDone }: Props) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [q, setQ] = useState('')
  const catalog = usePlaceCatalog(open)
  const setLocation = useSetLocation()

  const places = useMemo(() => {
    const term = q.trim().toLocaleLowerCase()
    return (catalog.data ?? []).filter((p) => !term || p.name.toLocaleLowerCase().includes(term) || p.region.toLocaleLowerCase().includes(term))
  }, [catalog.data, q])

  const run = (input: { place?: string; clear?: boolean }) =>
    setLocation.mutate(
      { ids: mediaIds, ...input },
      {
        onSuccess: (res) => {
          if (res.affected === 0) toast.error(t('location.noneChanged'))
          else toast.success(input.clear ? t('location.cleared', { count: res.affected }) : t('location.saved', { count: res.affected, place: res.place ?? '' }))
          onOpenChange(false)
          setQ('')
          onDone?.()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('location.title', { count: mediaIds.length })}</DialogTitle>
          <DialogDescription>{t('location.hint')}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('location.search')} aria-label={t('location.search')} autoFocus />
        </div>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
          {catalog.isLoading ? (
            <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : catalog.error ? (
            <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
          ) : places.length === 0 ? (
            <p className="p-4 text-sm text-muted">{t('location.noResults')}</p>
          ) : (
            <ul role="listbox" aria-label={t('location.search')}>
              {places.map((p) => (
                <li key={p.name}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    disabled={setLocation.isPending}
                    onClick={() => run({ place: p.name })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none disabled:opacity-50"
                  >
                    <MapPin className="size-4 shrink-0 text-accent" aria-hidden="true" />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted">{p.region}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => run({ clear: true })} disabled={setLocation.isPending}>
            {t('location.clear')}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
