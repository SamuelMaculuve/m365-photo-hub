import { Link } from 'react-router'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaPerson } from '@/types'
import { peopleService } from '@/services/people'
import { useRemoveFace } from '@/hooks/usePeople'
import { useErrorMessage } from '@/components/ui/states'
import { toast } from '@/components/ui/toast'
import { PersonAvatar } from './PersonAvatar'

interface PeopleChipsProps {
  mediaId: number
  people: MediaPerson[]
  canEdit: boolean
}

/** Pessoas reconhecidas numa fotografia; editores podem marcar «Não é esta pessoa». */
export function PeopleChips({ mediaId, people, canEdit }: PeopleChipsProps) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const remove = useRemoveFace(mediaId)
  return (
    <ul className="flex flex-wrap gap-1.5">
      {people.map((p) => {
        const name = p.name ?? t('people.noName')
        return (
          <li key={p.face_id} className="inline-flex items-center rounded-full bg-surface-2 text-xs">
            <Link
              to={`/people/${p.id}`}
              className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            >
              <PersonAvatar src={peopleService.thumbnailUrl(p.id)} alt="" className="size-6" />
              <span className={p.name ? undefined : 'text-muted'}>{name}</span>
            </Link>
            {canEdit && (
              <button
                type="button"
                aria-label={t('people.notThisPerson', { name })}
                title={t('people.notThisPersonShort')}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { faceId: p.face_id, personId: p.id },
                    { onSuccess: () => toast.success(t('people.faceRemoved')), onError: (e) => toast.error(errorMessage(e)) },
                  )
                }
                className="mr-0.5 flex size-5 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
