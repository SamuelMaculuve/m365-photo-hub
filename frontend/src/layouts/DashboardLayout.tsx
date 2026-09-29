import { Suspense, useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useMe } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { setLocale } from '@/i18n'
import { useTranslation } from 'react-i18next'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { BottomNav } from '@/components/layout/BottomNav'
import { OfflineBanner } from '@/components/layout/OfflineBanner'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { SkipLink } from '@/components/layout/SkipLink'
import { ErrorState } from '@/components/ui/states'
import { GridSkeleton } from '@/components/photos/GridSkeleton'

/** Layout autenticado: guarda de rota (GET /api/users/me) + navegação. */
export default function DashboardLayout() {
  const me = useMe()
  const { i18n } = useTranslation()
  const locale = me.data?.locale

  useEffect(() => {
    if (locale && !i18n.language.startsWith(locale)) void setLocale(locale)
  }, [locale, i18n.language])

  if (me.isLoading) return <FullPageSpinner />
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/login" replace />
    return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  }

  return (
    <div className="flex min-h-dvh">
      <SkipLink />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        <TopBar />
        <main id="main" tabIndex={-1} className="flex-1 px-3 pb-24 pt-4 outline-none md:px-6 md:pb-10 lg:pr-16">
          <Suspense fallback={<GridSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
