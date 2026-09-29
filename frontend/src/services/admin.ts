import { api, cleanParams, getData } from './api'
import type {
  AdminDashboard,
  AdminError,
  AdminLibrary,
  AdminLibraryInput,
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

  graphSites: (q: string) => getData<GraphSite[]>(`${A}/graph/sites`, { params: { q } }),
  graphDrives: (siteId: string) =>
    getData<GraphDrive[]>(`${A}/graph/sites/${encodeURIComponent(siteId)}/drives`),
  graphChildren: (driveId: string, itemId?: string | null) =>
    getData<GraphFolder[]>(`${A}/graph/drives/${encodeURIComponent(driveId)}/children`, {
      params: cleanParams({ item_id: itemId }),
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
