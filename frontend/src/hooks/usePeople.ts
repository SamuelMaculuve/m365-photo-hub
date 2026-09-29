import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { peopleService } from '@/services/people'
import { qk } from '@/lib/queryKeys'
import type { PeopleFilters, PersonInput } from '@/types'
import { useCurrentUser } from './useAuth'
import { useInfiniteMedia } from './useInfiniteMedia'

/** Reconhecimento facial activo para este utilizador (GET /api/users/me → features.faces). */
export function useFacesEnabled(): boolean {
  return useCurrentUser()?.features?.faces === true
}

const EDITOR_ROLES = new Set(['super_admin', 'photo_admin', 'editor'])

/** Editor+ (global ou numa biblioteca): pode ver pessoas ocultas e editar nomes. */
export function useCanEditPeople(): boolean {
  const user = useCurrentUser()
  if (!user) return false
  return EDITOR_ROLES.has(user.role) || user.libraries.some((l) => EDITOR_ROLES.has(l.role))
}

export function usePeople(filters: PeopleFilters, enabled = true) {
  return useQuery({
    queryKey: qk.people(filters),
    queryFn: () => peopleService.list(filters),
    enabled,
  })
}

export function usePerson(id: number) {
  return useQuery({ queryKey: qk.person(id), queryFn: () => peopleService.get(id), enabled: Number.isFinite(id) })
}

export function usePersonMedia(id: number) {
  return useInfiniteMedia(qk.personMedia(id), (cursor) => peopleService.media(id, cursor), Number.isFinite(id))
}

export function useUpdatePerson(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: PersonInput) => peopleService.update(id, input),
    onSuccess: (person) => {
      qc.setQueryData(qk.person(id), person)
      void qc.invalidateQueries({ queryKey: qk.peopleAll })
      void qc.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}

export function useMergePerson(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (intoId: number) => peopleService.merge(id, intoId),
    onSuccess: (person) => {
      qc.setQueryData(qk.person(person.id), person)
      qc.removeQueries({ queryKey: qk.person(id) })
      qc.removeQueries({ queryKey: qk.personMedia(id) })
      void qc.invalidateQueries({ queryKey: qk.personMedia(person.id) })
      void qc.invalidateQueries({ queryKey: qk.peopleAll })
      void qc.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}

export function useSuppressPerson() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => peopleService.suppress(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.person(id) })
      qc.removeQueries({ queryKey: qk.personMedia(id) })
      void qc.invalidateQueries({ queryKey: qk.peopleAll })
      void qc.invalidateQueries({ queryKey: ['photo'] })
    },
  })
}

/** «Não é esta pessoa»: remove o rosto e actualiza o detalhe da fotografia. */
export function useRemoveFace(mediaId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ faceId }: { faceId: number; personId: number }) => peopleService.removeFace(faceId),
    onSuccess: (_d, { personId }) => {
      void qc.invalidateQueries({ queryKey: qk.photo(mediaId) })
      void qc.invalidateQueries({ queryKey: qk.person(personId) })
      void qc.invalidateQueries({ queryKey: qk.personMedia(personId) })
      void qc.invalidateQueries({ queryKey: qk.peopleAll })
    },
  })
}
