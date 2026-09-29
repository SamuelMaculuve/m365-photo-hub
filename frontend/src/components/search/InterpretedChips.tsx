import { Calendar, Heart, Image, Type, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SearchInterpretation } from '@/types'
import { interpretedChips } from '@/lib/search'
import { formatDate } from '@/lib/format'
import { useLocale } from '@/hooks/useLocale'
import { Badge } from '@/components/ui/card'

export function InterpretedChips({ value }: { value?: SearchInterpretation | null }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const chips = interpretedChips(value)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">{t('search.understood')}</span>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          switch (c.kind) {
            case 'text':
              return <li key="text"><Badge tone="accent"><Type className="size-3" aria-hidden="true" />“{c.value}”</Badge></li>
            case 'type':
              return (
                <li key="type">
                  <Badge tone="accent">
                    {c.value === 'video' ? <Video className="size-3" aria-hidden="true" /> : <Image className="size-3" aria-hidden="true" />}
                    {c.value === 'video' ? t('filters.videos') : t('filters.photos')}
                  </Badge>
                </li>
              )
            case 'range':
              return (
                <li key="range">
                  <Badge tone="accent">
                    <Calendar className="size-3" aria-hidden="true" />
                    {c.from && c.to
                      ? t('search.range', { from: formatDate(c.from, locale), to: formatDate(c.to, locale) })
                      : c.from
                        ? t('search.since', { date: formatDate(c.from, locale) })
                        : t('search.until', { date: formatDate(c.to, locale) })}
                  </Badge>
                </li>
              )
            case 'favourite':
              return <li key="fav"><Badge tone="accent"><Heart className="size-3" aria-hidden="true" />{t('nav.favourites')}</Badge></li>
          }
        })}
      </ul>
    </div>
  )
}
