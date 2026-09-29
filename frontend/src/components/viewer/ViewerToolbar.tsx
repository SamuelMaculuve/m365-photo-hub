import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FolderPlus,
  Heart,
  Info,
  Maximize,
  RotateCw,
  Share2,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function ToolButton({ label, onClick, children, pressed, className }: { label: string; onClick: () => void; children: ReactNode; pressed?: boolean; className?: string }) {
  return (
    <Tooltip content={label}>
      <Button variant="overlay" size="icon" aria-label={label} aria-pressed={pressed} onClick={onClick} className={className}>
        {children}
      </Button>
    </Tooltip>
  )
}

function ToolLink({ label, href, children, external, download }: { label: string; href: string; children: ReactNode; external?: boolean; download?: boolean }) {
  return (
    <Tooltip content={label}>
      <Button variant="overlay" size="icon" asChild>
        <a
          href={href}
          aria-label={label}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          {...(download ? { download: '' } : {})}
        >
          {children}
        </a>
      </Button>
    </Tooltip>
  )
}

export interface ViewerToolbarProps {
  onBack: () => void
  isVideo: boolean
  downloadUrl: string | null
  webUrl?: string | null
  infoOpen?: boolean
  onInfo?: () => void
  favourite?: boolean
  onFavourite?: () => void
  onShare?: () => void
  onAddToAlbum?: () => void
  onRotate: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFullscreen: () => void
  onDelete?: () => void
}

export function ViewerToolbar(p: ViewerToolbarProps) {
  const { t } = useTranslation()
  return (
    <div
      role="toolbar"
      aria-label={t('viewer.toolbar')}
      className={
        'absolute left-0 top-0 z-20 flex items-center gap-1 bg-gradient-to-b from-black/70 to-transparent px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-6 text-white ' +
        // Com o painel de informação aberto, a barra fica sobre a imagem (no telemóvel o painel ocupa o ecrã).
        (p.infoOpen ? 'right-0 max-sm:hidden sm:right-96' : 'right-0')
      }
    >
      <ToolButton label={t('viewer.back')} onClick={p.onBack}>
        <ArrowLeft />
      </ToolButton>
      <div className="ml-auto flex items-center gap-0.5 overflow-x-auto">
        {!p.isVideo && (
          <>
            <span className="hidden sm:contents">
              <ToolButton label={t('viewer.zoomOut')} onClick={p.onZoomOut}><ZoomOut /></ToolButton>
              <ToolButton label={t('viewer.zoomIn')} onClick={p.onZoomIn}><ZoomIn /></ToolButton>
            </span>
            <ToolButton label={t('viewer.rotate')} onClick={p.onRotate}><RotateCw /></ToolButton>
          </>
        )}
        <span className="hidden sm:contents">
          <ToolButton label={t('viewer.fullscreen')} onClick={p.onFullscreen}><Maximize /></ToolButton>
        </span>
        {p.onShare && <ToolButton label={t('viewer.share')} onClick={p.onShare}><Share2 /></ToolButton>}
        {p.onAddToAlbum && <ToolButton label={t('viewer.addToAlbum')} onClick={p.onAddToAlbum}><FolderPlus /></ToolButton>}
        {p.onFavourite && (
          <ToolButton
            label={t(p.favourite ? 'photos.unfavourite' : 'photos.favourite')}
            pressed={p.favourite}
            onClick={p.onFavourite}
          >
            <Heart className={cn(p.favourite && 'fill-current text-rose-400')} />
          </ToolButton>
        )}
        {p.downloadUrl && (
          <ToolLink label={t('viewer.download')} href={p.downloadUrl} download>
            <Download />
          </ToolLink>
        )}
        {p.webUrl && (
          <ToolLink label={t('viewer.openInM365')} href={p.webUrl} external>
            <ExternalLink />
          </ToolLink>
        )}
        {p.onInfo && (
          <ToolButton label={t('viewer.info')} pressed={p.infoOpen} onClick={p.onInfo}>
            <Info />
          </ToolButton>
        )}
        {p.onDelete && (
          <ToolButton label={t('viewer.delete')} onClick={p.onDelete}>
            <Trash2 />
          </ToolButton>
        )}
      </div>
    </div>
  )
}
