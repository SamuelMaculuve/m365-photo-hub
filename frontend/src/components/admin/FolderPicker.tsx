import { useState } from 'react'
import { ChevronRight, Folder, HardDrive, Globe, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GraphDrive, GraphSite } from '@/types'
import { useGraphChildren, useGraphDrives, useGraphSites } from '@/hooks/useAdmin'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/states'

export interface PickedRoot {
  drive_id: string
  item_id: string
  label: string
}

/** Pasta-raiz do drive (assumido pelo contrato: item_id "root"). */
export const DRIVE_ROOT_ID = 'root'

function siteName(s: GraphSite): string {
  return s.display_name || s.displayName || s.name || s.web_url || s.webUrl || s.id
}

function ListSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>
}

const rowCls = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2'

/**
 * Assistente: procurar site → escolher drive → navegar pastas → adicionar raiz,
 * no tenant da organização indicada (por omissão, a organização "casa").
 */
export function FolderPicker({
  onAdd,
  selected,
  organizationId,
}: {
  onAdd: (root: PickedRoot) => void
  selected: PickedRoot[]
  organizationId?: number | null
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q, 350)
  const [site, setSite] = useState<GraphSite | null>(null)
  const [drive, setDrive] = useState<GraphDrive | null>(null)
  const [path, setPath] = useState<{ id: string; name: string }[]>([])

  const sites = useGraphSites(site ? '' : debounced, organizationId)
  const drives = useGraphDrives(site?.id ?? null, organizationId)
  const current = path[path.length - 1] ?? null
  const children = useGraphChildren(drive?.id ?? null, current?.id ?? null, organizationId)

  const isSelected = (driveId: string, itemId: string) => selected.some((r) => r.drive_id === driveId && r.item_id === itemId)
  const currentLabel = [site ? siteName(site) : '', drive?.name ?? '', ...path.map((p) => p.name)].filter(Boolean).join(' / ')

  // Passo 1 — sites
  if (!site) {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input className="pl-9" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('admin.picker.searchSites')} aria-label={t('admin.picker.searchSites')} />
        </div>
        {debounced.trim().length < 2 ? (
          <p className="text-sm text-muted">{t('admin.picker.typeToSearch')}</p>
        ) : sites.isLoading ? (
          <ListSkeleton />
        ) : sites.error ? (
          <ErrorState error={sites.error} onRetry={() => sites.refetch()} />
        ) : (sites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">{t('admin.picker.noSites')}</p>
        ) : (
          <ul className="flex flex-col">
            {(sites.data ?? []).map((s) => (
              <li key={s.id}>
                <button type="button" className={rowCls} onClick={() => setSite(s)}>
                  <Globe className="size-4 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{siteName(s)}</span>
                    {(s.web_url || s.webUrl) && <span className="block truncate text-xs text-muted">{s.web_url || s.webUrl}</span>}
                  </span>
                  <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  const breadcrumb = (
    <nav aria-label={t('admin.picker.breadcrumb')} className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" className="text-accent hover:underline" onClick={() => { setSite(null); setDrive(null); setPath([]) }}>
        {t('admin.picker.sites')}
      </button>
      <ChevronRight className="size-3 text-muted" aria-hidden="true" />
      <button type="button" className="text-accent hover:underline" onClick={() => { setDrive(null); setPath([]) }}>
        {siteName(site)}
      </button>
      {drive && (
        <>
          <ChevronRight className="size-3 text-muted" aria-hidden="true" />
          <button type="button" className="text-accent hover:underline" onClick={() => setPath([])}>{drive.name}</button>
        </>
      )}
      {path.map((p, i) => (
        <span key={p.id} className="inline-flex items-center gap-1">
          <ChevronRight className="size-3 text-muted" aria-hidden="true" />
          <button type="button" className="text-accent hover:underline" onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</button>
        </span>
      ))}
    </nav>
  )

  // Passo 2 — drives
  if (!drive) {
    return (
      <div className="flex flex-col gap-3">
        {breadcrumb}
        {drives.isLoading ? (
          <ListSkeleton />
        ) : drives.error ? (
          <ErrorState error={drives.error} onRetry={() => drives.refetch()} />
        ) : (
          <ul className="flex flex-col">
            {(drives.data ?? []).map((d) => (
              <li key={d.id}>
                <button type="button" className={rowCls} onClick={() => setDrive(d)}>
                  <HardDrive className="size-4 text-muted" aria-hidden="true" />
                  <span className="flex-1 truncate font-medium">{d.name}</span>
                  <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Passo 3 — pastas
  const currentId = current?.id ?? DRIVE_ROOT_ID
  const currentPicked = isSelected(drive.id, currentId)
  return (
    <div className="flex flex-col gap-3">
      {breadcrumb}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
        <span className="min-w-0 truncate text-sm">{currentLabel}</span>
        <Button size="sm" disabled={currentPicked} onClick={() => onAdd({ drive_id: drive.id, item_id: currentId, label: currentLabel })}>
          <Plus /> {currentPicked ? t('admin.picker.added') : t('admin.picker.addThis')}
        </Button>
      </div>
      {children.isLoading ? (
        <ListSkeleton />
      ) : children.error ? (
        <ErrorState error={children.error} onRetry={() => children.refetch()} />
      ) : (children.data ?? []).length === 0 ? (
        <p className="text-sm text-muted">{t('admin.picker.noFolders')}</p>
      ) : (
        <ul className="flex max-h-80 flex-col overflow-y-auto">
          {(children.data ?? []).map((f) => (
            <li key={f.id} className="flex items-center gap-1">
              <button type="button" className={rowCls} onClick={() => setPath([...path, { id: f.id, name: f.name }])}>
                <Folder className="size-4 text-accent" aria-hidden="true" />
                <span className="flex-1 truncate">{f.name}</span>
                {f.child_count != null && <span className="text-xs text-muted">{f.child_count}</span>}
                <ChevronRight className="size-4 text-muted" aria-hidden="true" />
              </button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('admin.picker.addFolder', { name: f.name })}
                disabled={isSelected(drive.id, f.id)}
                onClick={() => onAdd({ drive_id: drive.id, item_id: f.id, label: `${currentLabel} / ${f.name}` })}
              >
                <Plus />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
