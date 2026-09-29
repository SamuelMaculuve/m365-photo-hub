import { useNavigate } from 'react-router'
import { LogOut, Settings, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser, useLogout } from '@/hooks/useAuth'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function UserMenu() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const logout = useLogout()
  if (!user) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('userMenu.open', { name: user.name })}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate">{user.email}</span>
          <span className="mt-1 block">{t(`roles.${user.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <Settings aria-hidden="true" /> {t('nav.settings')}
        </DropdownMenuItem>
        {user.permissions.admin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <Shield aria-hidden="true" /> {t('nav.admin')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut aria-hidden="true" /> {t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
