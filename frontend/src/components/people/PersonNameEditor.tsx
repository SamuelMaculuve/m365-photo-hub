import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Person } from '@/types'
import { useUpdatePerson } from '@/hooks/usePeople'
import { cn } from '@/lib/utils'
import { useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'

/** Nome editável na própria página: grava com Enter ou ao sair do campo; Esc cancela. */
export function PersonNameEditor({ person }: { person: Person }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const update = useUpdatePerson(person.id)
  const [value, setValue] = useState(person.name ?? '')
  const [synced, setSynced] = useState(person.name)
  if (synced !== person.name) {
    setSynced(person.name)
    setValue(person.name ?? '')
  }

  if (!person.can.update) {
    return (
      <h1 className={cn('truncate text-3xl font-semibold tracking-tight', !person.name && 'text-muted')}>
        {person.name ?? t('people.unnamed')}
      </h1>
    )
  }

  const commit = () => {
    const next = value.trim() || null
    if (next === person.name || update.isPending) return
    update.mutate(
      { name: next },
      {
        onSuccess: () => toast.success(t('people.renamed')),
        onError: (e) => {
          setValue(person.name ?? '')
          toast.error(errorMessage(e))
        },
      },
    )
  }

  return (
    <h1 className="min-w-0">
      <input
        value={value}
        maxLength={120}
        aria-label={t('people.nameLabel')}
        placeholder={t('people.addName')}
        disabled={update.isPending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setValue(person.name ?? '')
          }
        }}
        className="w-full min-w-0 rounded-lg border border-transparent bg-transparent px-1 text-3xl font-semibold tracking-tight placeholder:text-muted hover:border-border focus-visible:border-border focus-visible:outline-2 focus-visible:outline-ring"
      />
    </h1>
  )
}
