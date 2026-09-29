import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) || 'Fotos'

export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground', className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="9" cy="9" r="2" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </span>
  )
}

export function Brand({ compact }: { compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <Link to="/" className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label={t('nav.home', { app: APP_NAME })}>
      <BrandMark />
      {!compact && <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>}
    </Link>
  )
}
