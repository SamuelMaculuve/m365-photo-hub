import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { AlbumInput } from '@/types'
import { ApiError } from '@/services/api'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label, Select, Textarea } from '@/components/ui/input'
import { DialogFooter } from '@/components/ui/dialog'

export interface AlbumFormValues {
  name: string
  description: string
  visibility: 'private' | 'organisation'
}

interface AlbumFormProps {
  initial?: Partial<AlbumFormValues>
  submitLabel: string
  pending?: boolean
  error?: unknown
  onCancel: () => void
  onSubmit: (values: AlbumInput & { name: string }) => void
}

export function AlbumForm({ initial, submitLabel, pending, error, onCancel, onSubmit }: AlbumFormProps) {
  const { t } = useTranslation()
  const id = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [visibility, setVisibility] = useState<AlbumFormValues['visibility']>(initial?.visibility ?? 'private')
  const [touched, setTouched] = useState(false)

  const apiErr = error instanceof ApiError ? error : null
  const nameError = touched && !name.trim() ? t('albums.nameRequired') : apiErr?.fieldError('name')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!name.trim()) return
    onSubmit({ name: name.trim(), description: description.trim() || null, visibility })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-name`}>{t('albums.name')}</Label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={200}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${id}-name-err` : undefined}
          placeholder={t('albums.namePlaceholder')}
        />
        <FieldError id={`${id}-name-err`} message={nameError} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-desc`}>{t('albums.description')}</Label>
        <Textarea id={`${id}-desc`} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-vis`}>{t('albums.visibility')}</Label>
        <Select id={`${id}-vis`} value={visibility} onChange={(e) => setVisibility(e.target.value as AlbumFormValues['visibility'])}>
          <option value="private">{t('albums.visibilityPrivate')}</option>
          <option value="organisation">{t('albums.visibilityOrganisation')}</option>
        </Select>
      </div>
      {apiErr && !apiErr.fieldError('name') && <FieldError message={apiErr.message} />}
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={pending}>{submitLabel}</Button>
      </DialogFooter>
    </form>
  )
}
