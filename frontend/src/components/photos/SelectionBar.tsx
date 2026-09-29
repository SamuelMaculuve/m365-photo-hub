import type { ReactNode } from 'react'
import { FolderPlus, Heart, Share2, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

export interface SelectionBarProps {
  count: number
  onClear: () => void
  onFavourite?: () => void
  onAddToAlbum?: () => void
  onShare?: () => void
  onTrash?: () => void
  extra?: ReactNode
  busy?: boolean
}

function Action({ label, onClick, icon, busy }: { label: string; onClick: () => void; icon: ReactNode; busy?: boolean }) {
  return (
    <Tooltip content={label}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} disabled={busy}>
        {icon}
      </Button>
    </Tooltip>
  )
}

export function SelectionBar({ count, onClear, onFavourite, onAddToAlbum, onShare, onTrash, extra, busy }: SelectionBarProps) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <div
      role="toolbar"
      aria-label={t('selection.toolbar')}
      className="fixed inset-x-2 top-2 z-40 flex items-center gap-1 rounded-2xl border border-border bg-surface/95 px-2 py-1.5 shadow-lg backdrop-blur animate-fade-in md:inset-x-auto md:left-1/2 md:top-3 md:-translate-x-1/2"
    >
      <Button variant="ghost" size="icon" aria-label={t('selection.clear')} onClick={onClear}>
        <X />
      </Button>
      <span className="px-2 text-sm font-medium" aria-live="polite">
        {t('selection.count', { count })}
      </span>
      <div className="ml-auto flex items-center gap-0.5">
        {onFavourite && <Action label={t('selection.favourite')} onClick={onFavourite} icon={<Heart />} busy={busy} />}
        {onAddToAlbum && <Action label={t('selection.addToAlbum')} onClick={onAddToAlbum} icon={<FolderPlus />} busy={busy} />}
        {onShare && <Action label={t('selection.share')} onClick={onShare} icon={<Share2 />} busy={busy} />}
        {extra}
        {onTrash && <Action label={t('selection.trash')} onClick={onTrash} icon={<Trash2 />} busy={busy} />}
      </div>
    </div>
  )
}
