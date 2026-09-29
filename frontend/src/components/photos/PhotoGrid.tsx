import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useTranslation } from 'react-i18next'
import type { Media } from '@/types'
import { buildTimelineRows, computeGridMetrics, findMonthRowIndex, rowHeight, targetCellFor } from '@/lib/timeline'
import { formatDayHeader, formatMonth } from '@/lib/format'
import { useElementWidth } from '@/hooks/useElementWidth'
import { useLocale } from '@/hooks/useLocale'
import { Spinner } from '@/components/ui/spinner'
import { PhotoTile } from './PhotoTile'

export interface PhotoGridHandle {
  scrollToMonth: (month: string) => boolean
}

export interface PhotoGridProps {
  items: Media[]
  groupByDay?: boolean
  hasNextPage?: boolean
  isFetchingNextPage?: boolean
  fetchNextPage?: () => unknown
  onOpen: (index: number) => void
  selectedIds?: ReadonlySet<number>
  onToggleSelect?: (id: number) => void
  onToggleFavourite?: (item: Media) => void
  /** Recebe um handle para saltar para um mês (usado pelo marcador lateral). */
  onReady?: (handle: PhotoGridHandle) => void
  label?: string
}

const EMPTY: ReadonlySet<number> = new Set()

export function PhotoGrid({
  items,
  groupByDay = true,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onOpen,
  selectedIds = EMPTY,
  onToggleSelect,
  onToggleFavourite,
  onReady,
  label,
}: PhotoGridProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const listRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(listRef)
  const metrics = useMemo(() => computeGridMetrics(width, targetCellFor(width)), [width])
  const rows = useMemo(
    () => buildTimelineRows(items, metrics.columns, { groupByDay, monthHeaders: groupByDay }),
    [items, metrics.columns, groupByDay],
  )

  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const el = listRef.current
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
  }, [width])

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => rowHeight(rows[i], metrics),
    overscan: 6,
    scrollMargin,
    getItemKey: (i) => rows[i].key,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [metrics, virtualizer])

  const virtualItems = virtualizer.getVirtualItems()
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1

  useEffect(() => {
    if (lastIndex >= rows.length - 8 && hasNextPage && !isFetchingNextPage && fetchNextPage) {
      void fetchNextPage()
    }
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const scrollToMonth = useCallback(
    (month: string) => {
      const idx = findMonthRowIndex(rows, month)
      if (idx < 0) return false
      virtualizer.scrollToIndex(idx, { align: 'start' })
      return true
    },
    [rows, virtualizer],
  )
  useEffect(() => {
    onReady?.({ scrollToMonth })
  }, [onReady, scrollToMonth])

  const selectionMode = selectedIds.size > 0

  // Navegação por setas entre miniaturas.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const idxAttr = target.getAttribute('data-index')
    if (idxAttr == null) return
    const idx = Number(idxAttr)
    const delta: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: metrics.columns,
      ArrowUp: -metrics.columns,
    }
    const d = delta[e.key]
    if (d === undefined) return
    const next = listRef.current?.querySelector<HTMLElement>(`[data-index="${idx + d}"]`)
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  return (
    <div ref={listRef} className="relative w-full" aria-label={label} role="region" onKeyDown={onKeyDown}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualItems.map((vi) => {
          const row = rows[vi.index]
          const style = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: vi.size,
            transform: `translateY(${vi.start - scrollMargin}px)`,
          }
          if (row.kind === 'month') {
            return (
              <div key={vi.key} style={style} className="flex items-end pb-3">
                <h2 className="text-xl font-semibold tracking-tight first-letter:uppercase">
                  {row.month === 'unknown' ? t('photos.unknownDate') : formatMonth(row.month, locale)}
                </h2>
              </div>
            )
          }
          if (row.kind === 'day') {
            return (
              <div key={vi.key} style={style} className="flex items-center">
                <h3 className="text-sm font-medium text-muted first-letter:uppercase">
                  {row.day === 'unknown' ? t('photos.unknownDate') : formatDayHeader(row.date, locale)}
                </h3>
              </div>
            )
          }
          return (
            <div key={vi.key} style={{ ...style, gap: metrics.gap }} className="flex">
              {row.items.map((item, j) => (
                <PhotoTile
                  key={item.id}
                  item={item}
                  index={row.start + j}
                  size={metrics.cellSize}
                  selected={selectedIds.has(item.id)}
                  selectionMode={selectionMode}
                  locale={locale}
                  onOpen={onOpen}
                  onToggleSelect={onToggleSelect}
                  onToggleFavourite={onToggleFavourite}
                />
              ))}
            </div>
          )
        })}
      </div>
      {isFetchingNextPage && (
        <div className="flex justify-center py-6">
          <Spinner label={t('common.loadingMore')} />
        </div>
      )}
    </div>
  )
}
