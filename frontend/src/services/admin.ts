import { api, cleanParams, getData } from './api'
import type {
  AdminDashboard,
  AdminError,
  AdminLibrary,
  AdminLibraryInput,
  AdminOrganization,
  AdminOrganizationInput,
  AdminSettings,
  AdminUser,
  AuditLog,
  CursorPage,
  FacesStatus,
  GraphDrive,
  GraphFolder,
  GraphSite,
  LibraryAccessEntry,
  LibraryValidation,
  Paginated,
  Role,
  SyncJob,
  SyncLog,
  SyncStatus,
} from '@/types'

const A = '/api/admin'

export interface AuditFilters {
  action?: string
  user_id?: number
  from?: string
  to?: string
}

export const adminService = {
  dashboard: () => getData<AdminDashboard>(`${A}/dashboard`),

  libraries: () => getData<AdminLibrary[]>(`${A}/libraries`),
  createLibrary: async (input: AdminLibraryInput) =>
    (await api.post<{ data: AdminLibrary }>(`${A}/libraries`, input)).data.data,
  updateLibrary: async (id: number, input: Partial<AdminLibraryInput>) =>
    (await api.put<{ data: AdminLibrary }>(`${A}/libraries/${id}`, input)).data.data,
  deleteLibrary: async (id: number) => {
    await api.delete(`${A}/libraries/${id}`)
  },
  validateLibrary: async (id: number) =>
    (await api.post<{ data: LibraryValidation }>(`${A}/libraries/${id}/validate`)).data.data,
  libraryAccess: (id: number) => getData<LibraryAccessEntry[]>(`${A}/libraries/${id}/access`),
  updateLibraryAccess: async (id: number, entries: LibraryAccessEntry[]) =>
    (await api.put<{ data: LibraryAccessEntry[] }>(`${A}/libraries/${id}/access`, { access: entries }))
      .data.data,

  organizations: () => getData<AdminOrganization[]>(`${A}/organizations`),
  createOrganization: async (input: AdminOrganizationInput) =>
    (await api.post<{ data: AdminOrganization }>(`${A}/organizations`, input)).data.data,
  updateOrganization: async (id: number, input: Partial<Omit<AdminOrganization, 'id'>>) =>
    (await api.patch<{ data: AdminOrganization }>(`${A}/organizations/${id}`, input)).data.data,

  // organizationId: tenant onde navegar (por omissão, a organização "casa").
  graphSites: (q: string, organizationId?: number | null) =>
    getData<GraphSite[]>(`${A}/graph/sites`, { params: cleanParams({ q, organization_id: organizationId }) }),
  graphDrives: (siteId: string, organizationId?: number | null) =>
    getData<GraphDrive[]>(`${A}/graph/sites/${encodeURIComponent(siteId)}/drives`, {
      params: cleanParams({ organization_id: organizationId }),
    }),
  graphChildren: (driveId: string, itemId?: string | null, organizationId?: number | null) =>
    getData<GraphFolder[]>(`${A}/graph/drives/${encodeURIComponent(driveId)}/children`, {
      params: cleanParams({ item_id: itemId, organization_id: organizationId }),
    }),

  syncStatus: () => getData<SyncStatus>(`${A}/sync/status`),
  startSync: async (input: { library_id?: number; full?: boolean }) => {
    await api.post(`${A}/sync`, input)
  },
  syncJobs: async (page = 1) =>
    (await api.get<Paginated<SyncJob>>(`${A}/sync/jobs`, { params: { page } })).data,
  syncLogs: (jobId: number) => getData<SyncLog[]>(`${A}/sync/jobs/${jobId}/logs`),

  auditLogs: async (filters: AuditFilters, cursor?: string | null) =>
    (
      await api.get<CursorPage<AuditLog>>(`${A}/audit-logs`, {
        params: cleanParams({ ...filters, cursor }),
      })
    ).data,

  users: async (page = 1) =>
    (await api.get<Paginated<AdminUser>>(`${A}/users`, { params: { page } })).data,
  updateUser: async (id: number, input: { role?: Role; is_active?: boolean }) =>
    (await api.put<{ data: AdminUser }>(`${A}/users/${id}`, input)).data.data,

  settings: () => getData<AdminSettings>(`${A}/settings`),
  updateSettings: async (input: AdminSettings) =>
    (await api.put<{ data: AdminSettings }>(`${A}/settings`, input)).data.data,

  errors: () => getData<AdminError[]>(`${A}/errors`),

  facesStatus: () => getData<FacesStatus>(`${A}/faces/status`),
  purgeFaces: async () => {
    await api.post(`${A}/faces/purge`, { confirm: 'APAGAR' })
  },
}
