import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Eye, EyeOff, ImageIcon, Merge, MoreVertical, ShieldOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMergePerson, usePerson, usePersonMedia, useSuppressPerson, useUpdatePerson } from '@/hooks/usePeople'
import { useLocale } from '@/hooks/useLocale'
import { formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { TypeConfirmDialog } from '@/components/ui/type-confirm-dialog'
import { MediaBrowser } from '@/components/photos/MediaBrowser'
import { PersonAvatar } from '@/components/people/PersonAvatar'
import { PersonNameEditor } from '@/components/people/PersonNameEditor'
import { MergePersonDialog } from '@/components/people/MergePersonDialog'

const SUPPRESS_WORD = 'EXCLUIR'

export default function PersonPage() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const errorMessage = useErrorMessage()
  const personId = Number(useParams().id)
  const person = usePerson(personId)
  const media = usePersonMedia(personId)
  const update = useUpdatePerson(personId)
  const merge = useMergePerson(personId)
  const suppress = useSuppressPerson()
  const [mergeOpen, setMergeOpen] = useState(false)
  const [suppressOpen, setSuppressOpen] = useState(false)

  if (person.isLoading) return <Skeleton className="h-24 w-72 rounded-2xl" />
  if (person.error || !person.data) return <ErrorState error={person.error} onRetry={() => person.refetch()} />
  const p = person.data
  const displayName = p.name ?? t('people.unnamed')

  const toggleHidden = () =>
    update.mutate(
      { is_hidden: !p.is_hidden },
      {
        onSuccess: (r) => toast.success(t(r.is_hidden ? 'people.hiddenDone' : 'people.shownDone')),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <>
      <div className="mb-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/people"><ArrowLeft /> {t('people.title')}</Link>
        </Button>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-4 pb-5">
        <div className="flex min-w-0 items-center gap-4">
          <PersonAvatar src={p.thumbnail} alt={displayName} className="size-20 sm:size-24" />
          <div className="min-w-0">
            <PersonNameEditor person={p} />
            <p className="mt-1 px-1 text-xs text-muted">
              {t('people.photoCount', { count: p.face_count, formatted: formatNumber(p.face_count, locale) })}
              {p.is_hidden && <> · {t('people.hiddenBadge')}</>}
            </p>
          </div>
        </div>
        {(p.can.update || p.can.suppress) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" aria-label={t('common.moreActions')}><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {p.can.update && (
                <>
                  <DropdownMenuItem disabled={update.isPending} onSelect={toggleHidden}>
                    {p.is_hidden ? <><Eye /> {t('people.show')}</> : <><EyeOff /> {t('people.hide')}</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setMergeOpen(true)}><Merge /> {t('people.merge')}</DropdownMenuItem>
                </>
              )}
              {p.can.suppress && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setSuppressOpen(true)}><ShieldOff /> {t('people.suppress')}</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <MediaBrowser
        query={media}
        groupByDay={false}
        allowTrash={false}
        label={displayName}
        empty={<EmptyState icon={ImageIcon} title={t('people.noMedia')} />}
      />

      {p.can.update && (
        <MergePersonDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          person={p}
          pending={merge.isPending}
          onConfirm={(intoId) =>
            merge.mutate(intoId, {
              onSuccess: (r) => {
                setMergeOpen(false)
                toast.success(t('people.merged'))
                navigate(`/people/${r.id}`, { replace: true })
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      )}
      {p.can.suppress && (
        <TypeConfirmDialog
          open={suppressOpen}
          onOpenChange={setSuppressOpen}
          title={t('people.suppressTitle', { name: displayName })}
          description={t('people.suppressBody')}
          warning={t('people.suppressWarning')}
          word={SUPPRESS_WORD}
          confirmLabel={t('people.suppress')}
          pending={suppress.isPending}
          onConfirm={() =>
            suppress.mutate(p.id, {
              onSuccess: () => {
                toast.success(t('people.suppressed'))
                navigate('/people', { replace: true })
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      )}
    </>
  )
}
