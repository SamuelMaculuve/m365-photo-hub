import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/chip'
import { Select } from '@/components/ui/input'
import type { MediaType, OrganizationSummary } from '@/types'

export function TypeFilterChips({ value, onChange }: { value: MediaType | undefined; onChange: (v: MediaType | undefined) => void }) {
  const { t } = useTranslation()
  const options: { key: string; value: MediaType | undefined; label: string }[] = [
    { key: 'all', value: undefined, label: t('filters.all') },
    { key: 'image', value: 'image', label: t('filters.photos') },
    { key: 'video', value: 'video', label: t('filters.videos') },
  ]
  return (
    <div role="group" aria-label={t('filters.type')} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o.key} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

/** Filtro por organização (tenant) — só aparece quando há conteúdo de mais de uma. */
export function OrganizationFilter({
  organizations,
  value,
  onChange,
}: {
  organizations: OrganizationSummary[]
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  const { t } = useTranslation()
  if (organizations.length < 2) return null
  return (
    <Select
      aria-label={t('filters.organization')}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="h-8 w-auto rounded-full py-0 text-sm"
    >
      <option value="">{t('filters.allOrganizations')}</option>
      {organizations.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </Select>
  )
}
