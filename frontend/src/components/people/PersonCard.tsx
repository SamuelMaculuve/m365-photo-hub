import { Link } from 'react-router'
import { EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Person } from '@/types'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PersonAvatar } from './PersonAvatar'

export function PersonCard({ person }: { person: Person }) {
  const { t } = useTranslation()
  const locale = useLocale()
  return (
    <Link
      to={`/people/${person.id}`}
      className="group flex flex-col items-center gap-2 rounded-2xl p-2 text-center hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="relative">
        <PersonAvatar
          src={person.thumbnail}
          alt={person.name ?? t('people.unnamed')}
          className={cn('size-24 ring-offset-2 transition-transform group-hover:scale-[1.03] sm:size-28', person.is_hidden && 'opacity-60')}
        />
        {person.is_hidden && (
          <span className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full border border-border bg-surface text-muted" title={t('people.hiddenBadge')}>
            <EyeOff className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t('people.hiddenBadge')}</span>
          </span>
        )}
      </span>
      <span className="min-w-0 max-w-full">
        <span className={cn('block truncate text-sm font-medium', !person.name && 'text-muted')}>
          {person.name ?? t('people.addName')}
        </span>
        <span className="block text-xs text-muted">
          {t('people.photoCount', { count: person.face_count, formatted: formatNumber(person.face_count, locale) })}
        </span>
      </span>
    </Link>
  )
}
