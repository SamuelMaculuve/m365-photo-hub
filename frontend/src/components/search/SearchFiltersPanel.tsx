import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { SearchFilters } from '@/types'
import { useAlbums } from '@/hooks/useAlbums'
import { useCurrentUser } from '@/hooks/useAuth'
import { usePlaces } from '@/hooks/usePlaces'
import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'

interface Props {
  value: SearchFilters
  onApply: (f: SearchFilters) => void
}

export function SearchFiltersPanel({ value, onApply }: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState<SearchFilters>(value)
  const albums = useAlbums()
  const places = usePlaces()
  const organizations = useCurrentUser()?.organizations ?? []
  useEffect(() => setDraft(value), [value])

  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => setDraft((d) => ({ ...d, [k]: v || undefined }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    onApply({ ...draft, q: value.q, semantic: value.semantic })
  }

  return (
    <form onSubmit={submit} aria-label={t('search.filters')} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-type`}>{t('filters.type')}</Label>
        <Select id={`${id}-type`} value={draft.type ?? ''} onChange={(e) => set('type', (e.target.value || undefined) as SearchFilters['type'])}>
          <option value="">{t('filters.all')}</option>
          <option value="image">{t('filters.photos')}</option>
          <option value="video">{t('filters.videos')}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-from`}>{t('filters.from')}</Label>
        <Input id={`${id}-from`} type="date" value={draft.from ?? ''} max={draft.to} onChange={(e) => set('from', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-to`}>{t('filters.to')}</Label>
        <Input id={`${id}-to`} type="date" value={draft.to ?? ''} min={draft.from} onChange={(e) => set('to', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-folder`}>{t('filters.folder')}</Label>
        <Input id={`${id}-folder`} value={draft.folder ?? ''} placeholder="/Fotos/2026" onChange={(e) => set('folder', e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-album`}>{t('filters.album')}</Label>
        <Select id={`${id}-album`} value={draft.album_id ?? ''} onChange={(e) => set('album_id', e.target.value ? Number(e.target.value) : undefined)}>
          <option value="">{t('filters.any')}</option>
          {(albums.data?.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-place`}>{t('filters.place')}</Label>
        <Select id={`${id}-place`} value={draft.place ?? ''} onChange={(e) => set('place', e.target.value)}>
          <option value="">{t('filters.any')}</option>
          {(places.data ?? []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </Select>
      </div>
      {organizations.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-org`}>{t('filters.organization')}</Label>
          <Select id={`${id}-org`} value={draft.organization_id ?? ''} onChange={(e) => set('organization_id', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">{t('filters.allOrganizations')}</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
      )}
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!draft.favourite} onChange={(e) => set('favourite', e.target.checked)} />
        {t('filters.favouritesOnly')}
      </label>
      <div className="flex items-end justify-end gap-2">
        <Button variant="ghost" onClick={() => onApply({ q: value.q, semantic: value.semantic })}>{t('filters.clear')}</Button>
        <Button type="submit">{t('filters.apply')}</Button>
      </div>
    </form>
  )
}
