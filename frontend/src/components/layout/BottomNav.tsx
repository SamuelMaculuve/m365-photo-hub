import { NavLink, useNavigate } from 'react-router'
import { Album, Image, MoreHorizontal, Search, Share2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PRIMARY_NAV, SECONDARY_NAV } from './nav'

const MAIN = [
  { to: '/', labelKey: 'nav.photos', icon: Image, end: true },
  { to: '/search', labelKey: 'nav.search', icon: Search },
  { to: '/albums', labelKey: 'nav.albums', icon: Album },
  { to: '/shared', labelKey: 'nav.shared', icon: Share2 },
]

const itemClass = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium'

export function BottomNav() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const more = [...PRIMARY_NAV.filter((i) => !MAIN.some((m) => m.to === i.to)), ...SECONDARY_NAV].filter(
    (i) => !i.adminOnly || user?.permissions.admin,
  )
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {MAIN.map(({ to, labelKey, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => cn(itemClass, isActive ? 'text-accent' : 'text-muted')}
        >
          <Icon className="size-5" aria-hidden="true" />
          {t(labelKey)}
        </NavLink>
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(itemClass, 'text-muted')}>
          <MoreHorizontal className="size-5" aria-hidden="true" />
          {t('nav.more')}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          {more.map(({ to, labelKey, icon: Icon }) => (
            <DropdownMenuItem key={to} onSelect={() => navigate(to)}>
              <Icon aria-hidden="true" /> {t(labelKey)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
