import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Folder, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AdminLibraryInput } from '@/types'
import { useAdminLibraries, useAdminOrganizations, useSaveLibrary } from '@/hooks/useAdmin'
import { useCurrentUser } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState, useErrorMessage } from '@/components/ui/states'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/toast'
import { FolderPicker, type PickedRoot } from '@/components/admin/FolderPicker'
import { LibraryAccessEditor } from '@/components/admin/LibraryAccessEditor'

type Step = 'roots' | 'options'

function Stepper({ step }: { step: Step }) {
  const { t } = useTranslation()
  const steps: Step[] = ['roots', 'options']
  return (
    <ol className="flex gap-2 text-sm" aria-label={t('admin.wizard.steps')}>
      {steps.map((s, i) => (
        <li key={s} aria-current={s === step ? 'step' : undefined} className={cn('flex items-center gap-2 rounded-full px-3 py-1', s === step ? 'bg-accent-soft text-accent' : 'text-muted')}>
          <span className="flex size-5 items-center justify-center rounded-full border border-current text-xs">{i + 1}</span>
          {t(`admin.wizard.${s}`)}
        </li>
      ))}
    </ol>
  )
}

export default function LibraryEditorPage() {
  const { t } = useTranslation()
  const id = useId()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const params = useParams()
  const libraryId = params.id && params.id !== 'new' ? Number(params.id) : undefined
  const libraries = useAdminLibraries()
  const existing = libraryId ? libraries.data?.find((l) => l.id === libraryId) : undefined
  const save = useSaveLibrary(libraryId)
  const me = useCurrentUser()
  const organizations = useAdminOrganizations(!!me?.permissions.manage_libraries)
  const activeOrgs = (organizations.data ?? []).filter((o) => o.enabled)

  const [step, setStep] = useState<Step>('roots')
  const [roots, setRoots] = useState<PickedRoot[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'organisation' | 'restricted'>('restricted')
  const [allowPublic, setAllowPublic] = useState(false)
  const [allowWrites, setAllowWrites] = useState(false)
  const [allowAi, setAllowAi] = useState(false)
  const [allowFaces, setAllowFaces] = useState(false)
  const [enabled, setEnabled] = useState(true)
  // Todas as raízes de uma biblioteca pertencem ao mesmo tenant. null = organização "casa".
  const [organizationId, setOrganizationId] = useState<number | null>(null)

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setDescription(existing.description ?? '')
    setVisibility(existing.visibility)
    setAllowPublic(existing.allow_public_links)
    setAllowWrites(existing.allow_writes)
    setAllowAi(existing.allow_ai ?? false)
    setAllowFaces(existing.allow_faces ?? false)
    setEnabled(existing.enabled)
    setOrganizationId(existing.organization?.id ?? null)
    setRoots(existing.roots.map((r) => ({ drive_id: r.drive_id, item_id: r.item_id, label: r.root_path || r.path || `${r.drive_name ?? r.drive_id} · ${r.item_id}` })))
  }, [existing])

  if (libraryId && libraries.isLoading) return <Skeleton className="h-64 rounded-2xl" />
  if (libraryId && (libraries.error || !existing)) return <ErrorState error={libraries.error ?? new ApiError({ status: 404, code: 'not_found', message: '' })} />

  const apiErr = save.error instanceof ApiError ? save.error : null
  const isEdit = !!libraryId

  const submit = () => {
    const input: AdminLibraryInput = {
      name: name.trim(),
      description: description.trim() || null,
      visibility,
      allow_public_links: allowPublic,
      allow_writes: allowWrites,
      allow_ai: allowAi,
      allow_faces: allowFaces,
      roots: roots.map(({ drive_id, item_id }) => ({ drive_id, item_id })),
      ...(organizationId ? { organization_id: organizationId } : {}),
      ...(isEdit ? { enabled } : {}),
    }
    save.mutate(input, {
      onSuccess: (lib) => {
        toast.success(t(isEdit ? 'admin.libraries.updated' : 'admin.libraries.created'))
        if (!isEdit && lib?.id) navigate(`/admin/libraries/${lib.id}`, { replace: true })
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const rootsCard = (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">{t('admin.wizard.rootsTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.wizard.rootsBody')}</p>
      </div>
      {roots.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label={t('admin.wizard.selectedRoots')}>
          {roots.map((r) => (
            <li key={`${r.drive_id}:${r.item_id}`} className="flex items-center gap-2 rounded-xl bg-accent-soft/50 px-3 py-2 text-sm">
              <Folder className="size-4 text-accent" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <Button variant="ghost" size="icon-sm" aria-label={t('common.remove')} onClick={() => setRoots(roots.filter((x) => x !== r))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {activeOrgs.length > 1 && (
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor={`${id}-org`}>{t('admin.libraries.organization')}</Label>
          <Select
            id={`${id}-org`}
            value={organizationId ?? ''}
            onChange={(e) => {
              // As pastas escolhidas pertencem ao tenant anterior: mudar de organização recomeça a escolha.
              setOrganizationId(e.target.value ? Number(e.target.value) : null)
              setRoots([])
            }}
          >
            <option value="">{t('admin.libraries.organizationDefault')}</option>
            {activeOrgs.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
          <p className="text-xs text-muted">{t('admin.libraries.organizationHint')}</p>
        </div>
      )}
      <FolderPicker key={organizationId ?? 'home'} organizationId={organizationId} selected={roots} onAdd={(r) => setRoots([...roots, r])} />
      <FieldError message={apiErr?.fieldError('roots')} />
    </Card>
  )

  const optionsCard = (
    <Card className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('admin.wizard.options')}</h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>{t('admin.libraries.name')}</Label>
        <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!apiErr?.fieldError('name')} />
        <FieldError message={apiErr?.fieldError('name')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-desc`}>{t('admin.libraries.description')}</Label>
        <Textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor={`${id}-vis`}>{t('admin.libraries.visibilityLabel')}</Label>
        <Select id={`${id}-vis`} value={visibility} onChange={(e) => setVisibility(e.target.value as 'organisation' | 'restricted')}>
          <option value="restricted">{t('admin.libraries.visibility.restricted')}</option>
          <option value="organisation">{t('admin.libraries.visibility.organisation')}</option>
        </Select>
        <p className="text-xs text-muted">{t(`admin.libraries.visibilityHint.${visibility}`)}</p>
      </div>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">{t('admin.libraries.publicLinks')}</span>
          <span className="block text-xs text-muted">{t('admin.libraries.publicLinksHint')}</span>
        </span>
        <Switch checked={allowPublic} onCheckedChange={setAllowPublic} aria-label={t('admin.libraries.publicLinks')} />
      </label>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">{t('admin.libraries.writes')}</span>
          <span className="block text-xs text-muted">{t('admin.libraries.writesHint')}</span>
        </span>
        <Switch checked={allowWrites} onCheckedChange={setAllowWrites} aria-label={t('admin.libraries.writes')} />
      </label>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">{t('admin.libraries.ai')}</span>
          <span className="block text-xs text-muted">{t('admin.libraries.aiHint')}</span>
        </span>
        <Switch checked={allowAi} onCheckedChange={setAllowAi} aria-label={t('admin.libraries.ai')} />
      </label>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>
          <span className="block font-medium">{t('admin.libraries.faces')}</span>
          <span className="block text-xs text-muted">{t('admin.libraries.facesHint')}</span>
        </span>
        <Switch checked={allowFaces} onCheckedChange={setAllowFaces} aria-label={t('admin.libraries.faces')} />
      </label>
      {isEdit && (
        <label className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">{t('admin.libraries.enabled')}</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t('admin.libraries.enabled')} />
        </label>
      )}
    </Card>
  )

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/libraries"><ArrowLeft /> {t('admin.nav.libraries')}</Link>
        </Button>
        {!isEdit && <Stepper step={step} />}
      </div>
      <h2 className="text-xl font-semibold">{isEdit ? existing?.name : t('admin.libraries.new')}</h2>

      {isEdit ? (
        <>
          {optionsCard}
          {rootsCard}
          <div className="flex justify-end">
            <Button disabled={save.isPending || !name.trim() || roots.length === 0} onClick={submit}>{t('common.save')}</Button>
          </div>
          {libraryId && <LibraryAccessEditor libraryId={libraryId} />}
        </>
      ) : step === 'roots' ? (
        <>
          {rootsCard}
          <div className="flex justify-end">
            <Button disabled={roots.length === 0} onClick={() => setStep('options')}>{t('common.next')}</Button>
          </div>
        </>
      ) : (
        <>
          {optionsCard}
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('roots')}>{t('common.back')}</Button>
            <Button disabled={save.isPending || !name.trim()} onClick={submit}>{t('admin.libraries.create')}</Button>
          </div>
        </>
      )}
    </div>
  )
}
