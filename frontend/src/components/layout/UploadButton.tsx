import { useId, useState } from 'react'
import { CheckCircle2, Upload, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '@/hooks/useAuth'
import { useUpload } from '@/hooks/useUpload'
import { useLocale } from '@/hooks/useLocale'
import { formatBytes } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label, Select } from '@/components/ui/input'
import { Tooltip } from '@/components/ui/tooltip'
import { useErrorMessage } from '@/components/ui/states'

export function UploadButton() {
  const { t } = useTranslation()
  const id = useId()
  const locale = useLocale()
  const errorMessage = useErrorMessage()
  const user = useCurrentUser()
  const upload = useUpload()
  const [open, setOpen] = useState(false)
  const writable = (user?.libraries ?? []).filter((l) => l.allow_writes)
  const [libraryId, setLibraryId] = useState<string>('')
  const [files, setFiles] = useState<File[]>([])

  if (!user?.permissions.upload || writable.length === 0) return null
  const lib = libraryId || String(writable[0].id)
  const done = upload.items.length > 0 && !upload.running

  const close = (o: boolean) => {
    if (!o && upload.running) return
    setOpen(o)
    if (!o) {
      upload.reset()
      setFiles([])
    }
  }

  return (
    <>
      <Tooltip content={t('upload.button')}>
        <Button variant="ghost" size="icon" aria-label={t('upload.button')} onClick={() => setOpen(true)}>
          <Upload />
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('upload.title')}</DialogTitle>
            <DialogDescription>{t('upload.description')}</DialogDescription>
          </DialogHeader>
          {upload.items.length === 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-lib`}>{t('upload.library')}</Label>
                <Select id={`${id}-lib`} value={lib} onChange={(e) => setLibraryId(e.target.value)}>
                  {writable.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-files`}>{t('upload.files')}</Label>
                <input
                  id={`${id}-files`}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                  className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-accent"
                />
              </div>
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto" aria-live="polite">
              {upload.items.map((i) => (
                <li key={i.key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{i.file.name}</span>
                    {i.state === 'done' && <CheckCircle2 className="size-4 text-success" aria-label={t('common.ok')} />}
                    {i.state === 'error' && <XCircle className="size-4 text-danger" aria-label={t('common.failed')} />}
                    {i.state !== 'done' && i.state !== 'error' && <span className="text-xs text-muted">{formatBytes(i.sent, locale)} / {formatBytes(i.file.size, locale)}</span>}
                  </div>
                  <Progress value={i.file.size ? (i.sent / i.file.size) * 100 : 0} label={i.file.name} />
                  {i.state === 'error' && <p className="text-xs text-danger">{errorMessage(i.error)}</p>}
                </li>
              ))}
            </ul>
          )}
          {done && <p className="text-sm text-muted">{t('upload.afterSync')}</p>}
          <DialogFooter>
            {upload.running ? (
              <Button variant="secondary" onClick={upload.cancel}>{t('common.cancel')}</Button>
            ) : done ? (
              <Button onClick={() => close(false)}>{t('common.done')}</Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => close(false)}>{t('common.cancel')}</Button>
                <Button disabled={files.length === 0} onClick={() => void upload.start(Number(lib), files)}>
                  {t('upload.start', { count: files.length })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
