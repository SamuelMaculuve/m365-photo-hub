import { useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { UserSummary } from '@/types'
import { useUserSearch } from '@/hooks/useShares'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

export function UserPicker({ value, onChange }: { value: UserSummary[]; onChange: (users: UserSummary[]) => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const search = useUserSearch(q)
  const selectedIds = new Set(value.map((u) => u.id))
  const results = (search.data ?? []).filter((u) => !selectedIds.has(u.id))

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('share.selectedPeople')}>
          {value.map((u) => (
            <li key={u.id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 pr-1 text-xs text-accent">
              {u.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.id !== u.id))}
                className="rounded-full p-0.5 hover:bg-black/10"
                aria-label={t('share.removePerson', { name: u.name })}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('share.searchPeople')}
        aria-label={t('share.searchPeople')}
      />
      {search.isFetching && <Spinner />}
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-xl border border-border">
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  onChange([...value, u])
                  setQ('')
                }}
              >
                <span className="font-medium">{u.name}</span>
                <span className="text-xs text-muted">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
