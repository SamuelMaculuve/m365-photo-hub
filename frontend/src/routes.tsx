import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import DashboardLayout from '@/layouts/DashboardLayout'
import RequireAdmin from '@/layouts/RequireAdmin'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { RouteError } from '@/components/layout/RouteError'

type Lazy = LazyExoticComponent<ComponentType>
const page = (C: Lazy, fallback = false) =>
  fallback ? (
    <Suspense fallback={<FullPageSpinner />}>
      <C />
    </Suspense>
  ) : (
    <C />
  )

const PhotosPage = lazy(() => import('@/pages/Photos/PhotosPage'))
const AlbumsPage = lazy(() => import('@/pages/Albums/AlbumsPage'))
const AlbumDetailPage = lazy(() => import('@/pages/Albums/AlbumDetailPage'))
const FavouritesPage = lazy(() => import('@/pages/Favourites/FavouritesPage'))
const PeoplePage = lazy(() => import('@/pages/People/PeoplePage'))
const PersonPage = lazy(() => import('@/pages/People/PersonPage'))
const PlacesPage = lazy(() => import('@/pages/Places/PlacesPage'))
const SearchPage = lazy(() => import('@/pages/Search/SearchPage'))
const SharedPage = lazy(() => import('@/pages/Shared/SharedPage'))
const SharedItemsPage = lazy(() => import('@/pages/Shared/SharedItemsPage'))
const TrashPage = lazy(() => import('@/pages/Trash/TrashPage'))
const SettingsPage = lazy(() => import('@/pages/Settings/SettingsPage'))
const LoginPage = lazy(() => import('@/pages/Login/LoginPage'))
const PublicSharePage = lazy(() => import('@/pages/PublicShare/PublicSharePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFound/NotFoundPage'))
const AdminLayout = lazy(() => import('@/pages/Admin/AdminLayout'))
const AdminDashboardPage = lazy(() => import('@/pages/Admin/AdminDashboardPage'))
const AdminLibrariesPage = lazy(() => import('@/pages/Admin/AdminLibrariesPage'))
const LibraryEditorPage = lazy(() => import('@/pages/Admin/LibraryEditorPage'))
const AdminSyncPage = lazy(() => import('@/pages/Admin/AdminSyncPage'))
const AdminUsersPage = lazy(() => import('@/pages/Admin/AdminUsersPage'))
const AdminOrganizationsPage = lazy(() => import('@/pages/Admin/AdminOrganizationsPage'))
const AdminAuditPage = lazy(() => import('@/pages/Admin/AdminAuditPage'))
const AdminSettingsPage = lazy(() => import('@/pages/Admin/AdminSettingsPage'))
const AdminErrorsPage = lazy(() => import('@/pages/Admin/AdminErrorsPage'))

export const routes: RouteObject[] = [
  { path: '/login', element: page(LoginPage, true), errorElement: <RouteError /> },
  { path: '/s/:token', element: page(PublicSharePage, true), errorElement: <RouteError /> },
  {
    path: '/',
    element: <DashboardLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(PhotosPage) },
      { path: 'albums', element: page(AlbumsPage) },
      { path: 'albums/:id', element: page(AlbumDetailPage) },
      { path: 'favourites', element: page(FavouritesPage) },
      { path: 'people', element: page(PeoplePage) },
      { path: 'people/:id', element: page(PersonPage) },
      { path: 'places', element: page(PlacesPage) },
      { path: 'search', element: page(SearchPage) },
      { path: 'shared', element: page(SharedPage) },
      { path: 'shared/:id', element: page(SharedItemsPage) },
      { path: 'trash', element: page(TrashPage) },
      { path: 'settings', element: page(SettingsPage) },
      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          {
            element: page(AdminLayout),
            children: [
              { index: true, element: page(AdminDashboardPage) },
              { path: 'libraries', element: page(AdminLibrariesPage) },
              { path: 'libraries/new', element: page(LibraryEditorPage) },
              { path: 'libraries/:id', element: page(LibraryEditorPage) },
              { path: 'sync', element: page(AdminSyncPage) },
              { path: 'organizations', element: page(AdminOrganizationsPage) },
              { path: 'users', element: page(AdminUsersPage) },
              { path: 'audit', element: page(AdminAuditPage) },
              { path: 'settings', element: page(AdminSettingsPage) },
              { path: 'errors', element: page(AdminErrorsPage) },
            ],
          },
        ],
      },
      { path: '*', element: page(NotFoundPage) },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
