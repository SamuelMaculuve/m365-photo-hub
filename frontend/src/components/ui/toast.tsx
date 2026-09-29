import { useSyncExternalStore } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function push(kind: ToastKind, message: string, duration = 4500): number {
  const id = nextId++
  items = [...items.slice(-3), { id, kind, message }]
  emit()
  if (duration > 0) setTimeout(() => dismiss(id), duration)
  return id
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

/** API semelhante ao sonner. */
export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m, 7000),
  info: (m: string) => push('info', m),
  dismiss,
  /** Só para testes. */
  _reset: () => {
    items = []
    emit()
  },
}

const icons = { success: CheckCircle2, error: AlertCircle, info: Info }

export function Toaster() {
  const { t } = useTranslation()
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => items,
    () => items,
  )
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end"
    >
      {list.map((item) => {
        const Icon = icons[item.kind]
        return (
          <div
            key={item.id}
            role={item.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg animate-fade-in',
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'mt-0.5 size-4 shrink-0',
                item.kind === 'success' && 'text-success',
                item.kind === 'error' && 'text-danger',
                item.kind === 'info' && 'text-accent',
              )}
            />
            <p className="flex-1">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              className="rounded-full p-1 text-muted hover:bg-surface-2"
              aria-label={t('common.dismiss')}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
