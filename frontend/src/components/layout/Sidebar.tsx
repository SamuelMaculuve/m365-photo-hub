import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './nav'
import { Brand } from './Brand'

function SideLink({ item }: { item: NavItem }) {
  const { t } = useTranslation()
  const label = t(item.labelKey)
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex h-11 items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors md:justify-center lg:justify-start lg:px-4',
          isActive ? 'bg-accent-soft text-accent' : 'text-foreground hover:bg-surface-2',
        )
      }
    >
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className="md:sr-only lg:not-sr-only">{label}</span>
    </NavLink>
  )
  return (
    <li>
      <span className="hidden md:block lg:hidden">
        <Tooltip content={label} side="right">{link}</Tooltip>
      </span>
      <span className="md:hidden lg:block">{link}</span>
    </li>
  )
}

export function Sidebar() {
  const { t } = useTranslation()
  const user = useCurrentUser()
  const secondary = SECONDARY_NAV.filter((i) => !i.adminOnly || user?.permissions.admin)
  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 border-r border-border bg-background px-3 py-4 md:flex md:w-20 lg:w-64">
      <div className="px-1 md:flex md:justify-center lg:block">
        <span className="hidden lg:block"><Brand /></span>
        <span className="lg:hidden"><Brand compact /></span>
      </div>
      <nav aria-label={t('nav.main')} className="flex flex-1 flex-col justify-between overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((i) => <SideLink key={i.to} item={i} />)}
        </ul>
        <ul className="flex flex-col gap-1 border-t border-border pt-3">
          {secondary.map((i) => <SideLink key={i.to} item={i} />)}
        </ul>
      </nav>
    </aside>
  )
}
