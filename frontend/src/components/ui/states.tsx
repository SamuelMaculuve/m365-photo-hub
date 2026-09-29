import type { ReactNode } from 'react'
import { AlertTriangle, CloudOff, Lock, SearchX, ShieldAlert, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError, normaliseError } from '@/services/api'
import { Button } from './button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted">{description}</p>}
      {action}
    </div>
  )
}

const ICONS: Record<string, LucideIcon> = {
  forbidden: ShieldAlert,
  not_found: SearchX,
  share_password_required: Lock,
  network_error: CloudOff,
  media_unavailable: CloudOff,
  graph_unavailable: CloudOff,
  graph_throttled: CloudOff,
}

/** Chave i18n amigável para um erro da API. */
export function errorMessageKey(err: ApiError): string {
  switch (err.code) {
    case 'forbidden':
    case 'not_found':
    case 'conflict':
    case 'share_expired':
    case 'too_many_requests':
    case 'media_unavailable':
    case 'graph_unavailable':
    case 'graph_throttled':
    case 'network_error':
    case 'unauthenticated':
    case 'validation_error':
      return `errors.${err.code}`
    default:
      return err.status >= 500 ? 'errors.server_error' : 'errors.unknown'
  }
}

export function useErrorMessage() {
  const { t } = useTranslation()
  return (error: unknown): string => {
    const err = normaliseError(error)
    // Mensagens de validação vêm já traduzidas pela API.
    if (err.code === 'validation_error' && err.message) return err.message
    return t(errorMessageKey(err))
  }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const message = useErrorMessage()
  const err = normaliseError(error)
  const Icon = ICONS[err.code] ?? AlertTriangle
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon className="size-6" aria-hidden="true" />
      </div>
      <p className="text-sm text-foreground">{message(error)}</p>
      {onRetry && err.code !== 'forbidden' && err.code !== 'not_found' && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
