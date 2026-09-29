import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Role } from '@/types'
import { useAdminUsers, useUpdateAdminUser } from '@/hooks/useAdmin'
import { useCurrentUser } from '@/hooks/useAuth'
import { useLocale } from '@/hooks/useLocale'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'

const ROLES: Role[] = ['viewer', 'contributor', 'editor', 'photo_admin', 'super_admin']

export default function AdminUsersPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const me = useCurrentUser()
  const errorMessage = useErrorMessage()
  const [page, setPage] = useState(1)
  const users = useAdminUsers(page)
  const update = useUpdateAdminUser()
  const canManage = me?.permissions.manage_users !== false

  const change = (id: number, input: { role?: Role; is_active?: boolean }) =>
    update.mutate({ id, ...input }, { onSuccess: () => toast.success(t('admin.users.saved')), onError: (e) => toast.error(errorMessage(e)) })

  return (
    <Card>
      <p className="mb-3 text-sm text-muted">{t('admin.users.subtitle')}</p>
      {users.isLoading ? (
        <Skeleton className="h-40" />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('settings.name')}</th>
                  <th className="py-2 pr-3 font-medium">{t('settings.role')}</th>
                  <th className="py-2 pr-3 font-medium">{t('admin.users.active')}</th>
                  <th className="py-2 font-medium">{t('admin.users.lastLogin')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(users.data?.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3">
                      <span className="block font-medium">{u.name}</span>
                      <span className="block text-xs text-muted">{u.email}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <Select
                        aria-label={t('admin.users.roleFor', { name: u.name })}
                        value={u.role}
                        disabled={!canManage || u.id === me?.id || update.isPending}
                        onChange={(e) => change(u.id, { role: e.target.value as Role })}
                        className="w-44"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <Switch
                        checked={u.is_active}
                        disabled={!canManage || u.id === me?.id || update.isPending}
                        onCheckedChange={(v) => change(u.id, { is_active: v })}
                        aria-label={t('admin.users.activeFor', { name: u.name })}
                      />
                    </td>
                    <td className="py-2 text-muted">{u.last_login_at ? formatDateTime(u.last_login_at, locale) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.data && users.data.meta.last_page > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</Button>
              <span className="text-muted">{t('common.pageOf', { page, total: users.data.meta.last_page })}</span>
              <Button variant="secondary" size="sm" disabled={page >= users.data.meta.last_page} onClick={() => setPage(page + 1)}>{t('common.next')}</Button>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">{t('admin.users.entraHint')}</p>
        </>
      )}
    </Card>
  )
}
