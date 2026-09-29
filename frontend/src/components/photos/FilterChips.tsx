import { useTranslation } from 'react-i18next'
import { Chip } from '@/components/ui/chip'
import type { MediaType } from '@/types'

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
