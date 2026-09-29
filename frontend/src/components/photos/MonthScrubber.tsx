import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TimelineBucket } from '@/types'
import { formatMonthShort } from '@/lib/format'
import { useLocale } from '@/hooks/useLocale'

/** Marcador lateral (desktop): anos proporcionais ao número de itens. */
export function MonthScrubber({ buckets, onJump }: { buckets: TimelineBucket[]; onJump: (month: string) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const marks = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.count, 0) || 1
    let acc = 0
    let lastYear = ''
    return buckets.map((b) => {
      const top = (acc / total) * 100
      acc += b.count
      const year = b.month.slice(0, 4)
      const showYear = year !== lastYear
      lastYear = year
      return { ...b, top, showYear, year }
    })
  }, [buckets])

  if (buckets.length < 2) return null

  return (
    <nav
      aria-label={t('photos.scrubber')}
      className="fixed right-1 top-20 bottom-6 z-20 hidden w-14 lg:block"
    >
      <ol className="relative h-full">
        {marks.map((m) => (
          <li key={m.month} className="absolute right-0" style={{ top: `${m.top}%` }}>
            <button
              type="button"
              onClick={() => onJump(m.month)}
              title={formatMonthShort(m.month, locale)}
              aria-label={t('photos.jumpTo', { month: formatMonthShort(m.month, locale) })}
              className={
                m.showYear
                  ? 'rounded px-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-foreground'
                  : 'block h-1 w-2 rounded bg-border opacity-60 hover:bg-accent'
              }
            >
              {m.showYear ? m.year : <span className="sr-only">{formatMonthShort(m.month, locale)}</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
