import { useState } from 'react'
import { User } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PersonAvatarProps {
  src: string
  alt: string
  className?: string
}

/** Recorte circular do rosto; mostra um ícone se a imagem falhar. */
export function PersonAvatar({ src, alt, className }: PersonAvatarProps) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={cn('relative block shrink-0 overflow-hidden rounded-full bg-surface-2', className)}>
      {failed ? (
        <span role="img" aria-label={alt} className="flex size-full items-center justify-center text-muted">
          <User className="size-1/2" aria-hidden="true" />
        </span>
      ) : (
        <img src={src} alt={alt} loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      )}
    </span>
  )
}
