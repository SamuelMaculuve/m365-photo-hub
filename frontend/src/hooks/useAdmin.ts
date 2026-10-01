import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminService, type AuditFilters } from '@/services/admin'
import { qk } from '@/lib/queryKeys'
import type {
  AdminLibraryInput,
  AdminOrganization,
  AdminOrganizationInput,
  AdminSettings,
  LibraryAccessEntry,
  Role,
} from '@/types'

export const SYNC_POLL_MS = 3000

export function useAdminDashboard() {
  return useQuery({ queryKey: qk.admin.dashboard, queryFn: adminService.dashboard, refetchInterval: 30_000 })
}

export function useAdminLibraries() {
  return useQuery({ queryKey: qk.admin.libraries, queryFn: adminService.libraries })
}

export function useSaveLibrary(id?: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AdminLibraryInput) =>
      id ? adminService.updateLibrary(id, input) : adminService.createLibrary(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.libraries })
      void qc.invalidateQueries({ queryKey: qk.libraries })
    },
  })
}

export function useToggleLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => adminService.updateLibrary(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.libraries }),
  })
}

export function useDeleteLibrary() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminService.deleteLibrary,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.libraries }),
  })
}

export function useValidateLibrary() {
  return useMutation({ mutationFn: adminService.validateLibrary })
}

export function useLibraryAccess(id: number) {
  return useQuery({ queryKey: qk.admin.access(id), queryFn: () => adminService.libraryAccess(id) })
}

export function useSaveLibraryAccess(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entries: LibraryAccessEntry[]) => adminService.updateLibraryAccess(id, entries),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.access(id) }),
  })
}

export function useAdminOrganizations(enabled = true) {
  return useQuery({ queryKey: qk.admin.organizations, queryFn: adminService.organizations, enabled })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AdminOrganizationInput) => adminService.createOrganization(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.admin.organizations }),
  })
}

export function useUpdateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<Omit<AdminOrganization, 'id'>> & { id: number }) =>
      adminService.updateOrganization(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.organizations })
      void qc.invalidateQueries({ queryKey: qk.me })
    },
  })
}

export function useGraphSites(q: string, organizationId?: number | null) {
  return useQuery({
    queryKey: qk.admin.sites(q, organizationId),
    queryFn: () => adminService.graphSites(q, organizationId),
    enabled: q.trim().length >= 2,
  })
}

export function useGraphDrives(siteId: string | null, organizationId?: number | null) {
  return useQuery({
    queryKey: qk.admin.drives(siteId ?? '', organizationId),
    queryFn: () => adminService.graphDrives(siteId as string, organizationId),
    enabled: !!siteId,
  })
}

export function useGraphChildren(driveId: string | null, itemId: string | null, organizationId?: number | null) {
  return useQuery({
    queryKey: qk.admin.children(driveId ?? '', itemId, organizationId),
    queryFn: () => adminService.graphChildren(driveId as string, itemId, organizationId),
    enabled: !!driveId,
  })
}

export function useSyncStatus() {
  return useQuery({
    queryKey: qk.admin.syncStatus,
    queryFn: adminService.syncStatus,
    refetchInterval: (q) => ((q.state.data?.running.length ?? 0) > 0 ? SYNC_POLL_MS : false),
  })
}

export function useStartSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminService.startSync,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.syncStatus })
      void qc.invalidateQueries({ queryKey: ['admin', 'sync-jobs'] })
    },
  })
}

export function useSyncJobs(page: number, running: boolean) {
  return useQuery({
    queryKey: qk.admin.syncJobs(page),
    queryFn: () => adminService.syncJobs(page),
    refetchInterval: running ? SYNC_POLL_MS * 2 : false,
  })
}

export function useSyncLogs(jobId: number | null) {
  return useQuery({
    queryKey: qk.admin.syncLogs(jobId ?? 0),
    queryFn: () => adminService.syncLogs(jobId as number),
    enabled: jobId != null,
  })
}

export function useAuditLogs(filters: AuditFilters) {
  return useInfiniteQuery({
    queryKey: qk.admin.audit(filters),
    queryFn: ({ pageParam }) => adminService.auditLogs(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta?.next_cursor ?? null,
  })
}

export function useAdminUsers(page: number) {
  return useQuery({ queryKey: qk.admin.users(page), queryFn: () => adminService.users(page) })
}

export function useUpdateAdminUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number; role?: Role; is_active?: boolean }) => adminService.updateUser(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
}

export function useAdminSettings() {
  return useQuery({ queryKey: qk.admin.settings, queryFn: adminService.settings })
}

export function useSaveAdminSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (s: AdminSettings) => adminService.updateSettings(s),
    onSuccess: (data) => qc.setQueryData(qk.admin.settings, data),
  })
}

export function useAdminErrors() {
  return useQuery({ queryKey: qk.admin.errors, queryFn: adminService.errors })
}

export function useFacesStatus(enabled = true) {
  return useQuery({ queryKey: qk.admin.facesStatus, queryFn: adminService.facesStatus, enabled, refetchInterval: 60_000 })
}

export function usePurgeFaces() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: adminService.purgeFaces,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.facesStatus })
      void qc.invalidateQueries({ queryKey: qk.peopleAll })
      void qc.invalidateQueries({ queryKey: ['person'] })
      void qc.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}
