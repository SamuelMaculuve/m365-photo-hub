import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const TABS: { to: string; key: string; end?: boolean; superAdmin?: boolean }[] = [
  { to: '/admin', key: 'admin.nav.dashboard', end: true },
  { to: '/admin/libraries', key: 'admin.nav.libraries' },
  { to: '/admin/sync', key: 'admin.nav.sync' },
  { to: '/admin/organizations', key: 'admin.nav.organizations', superAdmin: true },
  { to: '/admin/users', key: 'admin.nav.users' },
  { to: '/admin/audit', key: 'admin.nav.audit' },
  { to: '/admin/settings', key: 'admin.nav.settings' },
  { to: '/admin/errors', key: 'admin.nav.errors' },
]

export default function AdminLayout() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const tabs = TABS.filter((tab) => !tab.superAdmin || me?.permissions.manage_libraries)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
        <nav aria-label={t('admin.title')} className="-mx-1 mt-3 overflow-x-auto">
          <ul className="flex gap-1 px-1">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex h-9 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors',
                      isActive ? 'bg-accent text-accent-foreground' : 'text-muted hover:bg-surface-2 hover:text-foreground',
                    )
                  }
                >
                  {t(tab.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Outlet />
    </div>
  )
}
