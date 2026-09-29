import { useState } from 'react'
import { useParams } from 'react-router'
import { Clock, SearchX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePublicShare } from '@/hooks/usePublicShare'
import { ApiError } from '@/services/api'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { GridSkeleton } from '@/components/photos/GridSkeleton'
import { Brand } from '@/components/layout/Brand'
import { ShareContent } from '@/components/share/ShareContent'
import { PasswordPrompt } from './PasswordPrompt'

export default function PublicSharePage() {
  const { t } = useTranslation()
  const token = useParams().token ?? ''
  const [password, setPassword] = useState<string | null>(null)
  const share = usePublicShare(token, password)
  const err = share.error instanceof ApiError ? share.error : null

  let body
  if (share.isLoading) body = <GridSkeleton />
  else if (err?.status === 423 || err?.code === 'share_password_required')
    body = <PasswordPrompt wrong={password != null} pending={share.isFetching} onSubmit={setPassword} />
  else if (err?.status === 410 || err?.code === 'share_expired')
    body = <EmptyState icon={Clock} title={t('publicShare.expiredTitle')} description={t('publicShare.expiredBody')} />
  else if (err?.status === 404)
    body = <EmptyState icon={SearchX} title={t('publicShare.notFoundTitle')} description={t('publicShare.notFoundBody')} />
  else if (share.error) body = <ErrorState error={share.error} onRetry={() => share.refetch()} />
  else if (share.data) body = <ShareContent share={share.data} />

  return (
    <div className="min-h-dvh">
      <header className="flex h-16 items-center border-b border-border px-4 md:px-6">
        <Brand />
      </header>
      <main id="main" className="px-3 py-6 md:px-6">{body}</main>
    </div>
  )
}
