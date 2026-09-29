import type { Media } from '@/types'
import { localDayKey } from './format'

export type TimelineRow =
  | { kind: 'month'; key: string; month: string }
  | { kind: 'day'; key: string; day: string; date: string }
  | { kind: 'photos'; key: string; start: number; items: Media[] }

export interface GridMetrics {
  columns: number
  cellSize: number
  gap: number
}

export const MONTH_ROW_HEIGHT = 64
export const DAY_ROW_HEIGHT = 40

/** Calcula colunas/tamanho de célula a partir da largura do contentor. */
export function computeGridMetrics(width: number, targetCell: number, gap = 4): GridMetrics {
  const w = Math.max(0, width)
  const columns = Math.max(2, Math.floor((w + gap) / (targetCell + gap)) || 2)
  const cellSize = Math.max(40, Math.floor((w - gap * (columns - 1)) / columns))
  return { columns, cellSize, gap }
}

export function targetCellFor(width: number): number {
  if (width < 640) return 110
  if (width < 1024) return 150
  return 180
}

export interface BuildRowsOptions {
  /** Agrupar por dia (cabeçalhos de dia). Omissão: true. */
  groupByDay?: boolean
  /** Mostrar cabeçalhos de mês. Omissão: true. */
  monthHeaders?: boolean
}

/**
 * Transforma a lista ordenada (sort_at DESC) em linhas virtualizáveis:
 * cabeçalho de mês → cabeçalho de dia → linhas de fotografias com `columns` itens.
 * `start` é o índice do primeiro item da linha em `items` (para o visualizador).
 * Complexidade O(n), um único passo.
 */
export function buildTimelineRows(
  items: readonly Media[],
  columns: number,
  options: BuildRowsOptions = {},
): TimelineRow[] {
  const groupByDay = options.groupByDay ?? true
  const monthHeaders = options.monthHeaders ?? true
  const cols = Math.max(1, Math.floor(columns))
  const rows: TimelineRow[] = []

  let currentMonth = ''
  let currentDay = ''
  let rowStart = -1
  let rowItems: Media[] = []

  const flush = () => {
    if (rowItems.length) {
      rows.push({ kind: 'photos', key: `p-${rowItems[0].id}`, start: rowStart, items: rowItems })
      rowItems = []
    }
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (groupByDay || monthHeaders) {
      const d = new Date(item.sort_at)
      const dayKey = Number.isNaN(d.getTime()) ? 'unknown' : localDayKey(d)
      const monthKey = dayKey === 'unknown' ? 'unknown' : dayKey.slice(0, 7)
      if (monthHeaders && monthKey !== currentMonth) {
        flush()
        currentMonth = monthKey
        rows.push({ kind: 'month', key: `m-${monthKey}`, month: monthKey })
        currentDay = ''
      }
      if (groupByDay && dayKey !== currentDay) {
        flush()
        currentDay = dayKey
        rows.push({ kind: 'day', key: `d-${dayKey}`, day: dayKey, date: item.sort_at })
      }
    }
    if (rowItems.length === 0) rowStart = i
    rowItems.push(item)
    if (rowItems.length === cols) flush()
  }
  flush()
  return rows
}

export function rowHeight(row: TimelineRow, metrics: GridMetrics): number {
  switch (row.kind) {
    case 'month':
      return MONTH_ROW_HEIGHT
    case 'day':
      return DAY_ROW_HEIGHT
    default:
      return metrics.cellSize + metrics.gap
  }
}

/** Índice da primeira linha de um mês ("2026-09"), ou -1. */
export function findMonthRowIndex(rows: readonly TimelineRow[], month: string): number {
  return rows.findIndex((r) => r.kind === 'month' && r.month === month)
}
