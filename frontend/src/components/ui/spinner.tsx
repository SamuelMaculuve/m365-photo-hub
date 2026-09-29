import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <Loader2 aria-hidden="true" className={cn('size-5 animate-spin text-muted', className)} />
      {label ? <span className="text-sm text-muted">{label}</span> : <span className="sr-only">…</span>}
    </span>
  )
}
