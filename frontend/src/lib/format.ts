/** Formatação dependente da língua activa, sempre via Intl. */

export type AppLocale = 'pt' | 'en'

export function intlLocale(locale: string): string {
  return locale.startsWith('en') ? 'en-US' : 'pt-MZ'
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "28 de setembro de 2026" / "September 28, 2026" */
export function formatDate(value: string | Date | null | undefined, locale: string): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'long' }).format(d)
}

/** Data e hora, ex.: "28 de setembro de 2026, 10:22". */
export function formatDateTime(value: string | Date | null | undefined, locale: string): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d)
}

/** Cabeçalho de dia, ex.: "seg., 28 de setembro de 2026". */
export function formatDayHeader(value: string | Date, locale: string): string {
  const d = toDate(value)
  if (!d) return ''
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

/** "2026-09" → "setembro de 2026" / "September 2026" */
export function formatMonth(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'long', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  )
}

/** Mês curto para o marcador lateral: "set. 2026". */
export function formatMonthShort(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: 'numeric' }).format(
    new Date(y, m - 1, 1),
  )
}

/** Duração de vídeo: 65000 → "1:05"; 3723000 → "1:02:03". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return ''
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export function formatNumber(n: number | null | undefined, locale: string): string {
  if (n == null) return ''
  return new Intl.NumberFormat(intlLocale(locale)).format(n)
}

export function formatBytes(bytes: number | null | undefined, locale: string): string {
  if (bytes == null || !Number.isFinite(bytes)) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: i === 0 ? 0 : 1 })
  return `${nf.format(v)} ${units[i]}`
}

/** Chave local "YYYY-MM-DD" (fuso do utilizador). */
export function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Data local "YYYY-MM-DD" para <input type="date">. */
export function toDateInput(d: Date): string {
  return localDayKey(d)
}

/** Divide segundos em {h,m,s} para mensagens de tempo restante. */
export function splitDuration(seconds: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.round(seconds))
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}
