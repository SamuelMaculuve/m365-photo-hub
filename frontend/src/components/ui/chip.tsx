import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Chip({ active, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors [&_svg]:size-3.5',
        active
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-foreground hover:bg-surface-2',
        className,
      )}
      {...props}
    />
  )
}
