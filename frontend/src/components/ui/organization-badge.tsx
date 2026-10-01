import type { OrganizationSummary } from '@/types'
import { cn } from '@/lib/utils'

/** Marca discreta com a cor e o nome da organização (tenant) de origem. */
export function OrganizationBadge({ organization, className }: { organization: OrganizationSummary; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', !organization.color && 'bg-accent')}
        style={organization.color ? { backgroundColor: organization.color } : undefined}
      />
      <span className="truncate">{organization.name}</span>
    </span>
  )
}
