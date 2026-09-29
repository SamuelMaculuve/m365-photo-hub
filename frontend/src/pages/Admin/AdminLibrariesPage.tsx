import { useState } from 'react'
import { Link } from 'react-router'
import { FolderTree, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AdminLibrary, LibraryValidation } from '@/types'
import { useAdminLibraries, useDeleteLibrary, useToggleLibrary, useValidateLibrary } from '@/hooks/useAdmin'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { ValidationResult } from '@/components/admin/ValidationResult'

function LibraryRow({ lib, onDelete }: { lib: AdminLibrary; onDelete: (l: AdminLibrary) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const toggle = useToggleLibrary()
  const validate = useValidateLibrary()
  const [result, setResult] = useState<LibraryValidation | null>(null)
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{lib.name}</h3>
          {lib.description && <p className="text-sm text-muted">{lib.description}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge>{t(`admin.libraries.visibility.${lib.visibility}`)}</Badge>
            <Badge>{t('admin.libraries.rootCount', { count: lib.roots.length })}</Badge>
            {lib.media_count != null && <Badge>{t('settings.itemCount', { count: lib.media_count, formatted: formatNumber(lib.media_count, locale) })}</Badge>}
            {lib.allow_public_links && <Badge tone="warning">{t('admin.libraries.publicLinks')}</Badge>}
            {lib.allow_writes && <Badge tone="warning">{t('admin.libraries.writes')}</Badge>}
            {lib.status && <Badge tone="accent">{lib.status}</Badge>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={lib.enabled}
            disabled={toggle.isPending}
            onCheckedChange={(enabled) => toggle.mutate({ id: lib.id, enabled }, { onError: (e) => toast.error(errorMessage(e)) })}
            aria-label={t('admin.libraries.enabled')}
          />
          {lib.enabled ? t('common.enabled') : t('common.disabled')}
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" asChild>
          <Link to={`/admin/libraries/${lib.id}`}><Pencil /> {t('common.edit')}</Link>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={validate.isPending}
          onClick={() => validate.mutate(lib.id, { onSuccess: setResult, onError: (e) => toast.error(errorMessage(e)) })}
        >
          <ShieldCheck /> {validate.isPending ? t('admin.libraries.validating') : t('admin.libraries.validate')}
        </Button>
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => onDelete(lib)}>
          <Trash2 /> {t('common.delete')}
        </Button>
      </div>
      {result && <ValidationResult result={result} />}
    </Card>
  )
}

export default function AdminLibrariesPage() {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const q = useAdminLibraries()
  const del = useDeleteLibrary()
  const [target, setTarget] = useState<AdminLibrary | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">{t('admin.libraries.subtitle')}</p>
        <Button asChild><Link to="/admin/libraries/new"><Plus /> {t('admin.libraries.new')}</Link></Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon={FolderTree} title={t('admin.libraries.emptyTitle')} description={t('admin.libraries.emptyBody')} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {(q.data ?? []).map((l) => <LibraryRow key={l.id} lib={l} onDelete={setTarget} />)}
        </div>
      )}
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('admin.libraries.deleteTitle', { name: target?.name ?? '' })}
        description={t('admin.libraries.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        pending={del.isPending}
        onConfirm={() =>
          target &&
          del.mutate(target.id, {
            onSuccess: () => { toast.success(t('admin.libraries.deleted')); setTarget(null) },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </div>
  )
}
