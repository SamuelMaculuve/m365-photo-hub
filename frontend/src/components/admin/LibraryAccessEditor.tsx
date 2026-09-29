import { useEffect, useId, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LibraryAccessEntry } from '@/types'
import { useLibraryAccess, useSaveLibraryAccess } from '@/hooks/useAdmin'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'

const ROLES: LibraryAccessEntry['role'][] = ['viewer', 'contributor', 'editor', 'photo_admin']

export function LibraryAccessEditor({ libraryId }: { libraryId: number }) {
  const { t } = useTranslation()
  const id = useId()
  const errorMessage = useErrorMessage()
  const access = useLibraryAccess(libraryId)
  const save = useSaveLibraryAccess(libraryId)
  const [rows, setRows] = useState<LibraryAccessEntry[]>([])
  const [draft, setDraft] = useState<LibraryAccessEntry>({ principal_type: 'group', principal_id: '', display_name: '', role: 'viewer' })

  useEffect(() => {
    if (access.data) setRows(access.data)
  }, [access.data])

  const add = () => {
    if (!draft.principal_id.trim()) return
    setRows([...rows, { ...draft, principal_id: draft.principal_id.trim(), display_name: draft.display_name.trim() || draft.principal_id.trim() }])
    setDraft({ ...draft, principal_id: '', display_name: '' })
  }

  return (
    <Card>
      <h2 className="text-base font-semibold">{t('admin.access.title')}</h2>
      <p className="mb-4 text-sm text-muted">{t('admin.access.subtitle')}</p>
      {access.isLoading ? (
        <Skeleton className="h-24" />
      ) : access.error ? (
        <ErrorState error={access.error} onRetry={() => access.refetch()} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('admin.access.principal')}</th>
                  <th className="py-2 pr-3 font-medium">{t('admin.access.type')}</th>
                  <th className="py-2 pr-3 font-medium">{t('admin.access.role')}</th>
                  <th className="py-2"><span className="sr-only">{t('common.actions')}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="py-3 text-muted">{t('admin.access.none')}</td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.principal_type}-${r.principal_id}`}>
                    <td className="py-2 pr-3">
                      <span className="block font-medium">{r.display_name}</span>
                      <span className="block break-all text-xs text-muted">{r.principal_id}</span>
                    </td>
                    <td className="py-2 pr-3">{t(`admin.access.types.${r.principal_type}`)}</td>
                    <td className="py-2 pr-3">
                      <Select aria-label={t('admin.access.role')} value={r.role} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, role: e.target.value as LibraryAccessEntry['role'] } : x)))}>
                        {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
                      </Select>
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="icon-sm" aria-label={t('common.remove')} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <fieldset className="mt-4 grid gap-2 sm:grid-cols-[8rem_1fr_1fr_9rem_auto]">
            <legend className="mb-2 text-sm font-medium">{t('admin.access.add')}</legend>
            <Select aria-label={t('admin.access.type')} value={draft.principal_type} onChange={(e) => setDraft({ ...draft, principal_type: e.target.value as 'user' | 'group' })}>
              <option value="group">{t('admin.access.types.group')}</option>
              <option value="user">{t('admin.access.types.user')}</option>
            </Select>
            <Input id={`${id}-pid`} aria-label={t('admin.access.principalId')} placeholder={t('admin.access.principalId')} value={draft.principal_id} onChange={(e) => setDraft({ ...draft, principal_id: e.target.value })} />
            <Input aria-label={t('admin.access.displayName')} placeholder={t('admin.access.displayName')} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
            <Select aria-label={t('admin.access.role')} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as LibraryAccessEntry['role'] })}>
              {ROLES.map((role) => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}
            </Select>
            <Button variant="secondary" onClick={add} disabled={!draft.principal_id.trim()}><Plus /> {t('common.add')}</Button>
          </fieldset>

          <div className="mt-4 flex justify-end">
            <Button
              disabled={save.isPending}
              onClick={() => save.mutate(rows, { onSuccess: () => toast.success(t('admin.access.saved')), onError: (e) => toast.error(errorMessage(e)) })}
            >
              {t('common.save')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
