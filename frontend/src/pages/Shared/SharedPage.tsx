import { useState } from 'react'
import { Link } from 'react-router'
import { Building2, Copy, ExternalLink, Globe, Link2Off, Lock, Share2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Share } from '@/types'
import { useMyShares, useRevokeShare, useSharedWithMe } from '@/hooks/useShares'
import { useCopy } from '@/hooks/useCopy'
import { useLocale } from '@/hooks/useLocale'
import { absoluteUrl } from '@/services/shares'
import { formatDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState, useErrorMessage } from '@/components/ui/states'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'

const AUDIENCE_ICON = { organisation: Building2, users: Users, public: Globe }

function ShareMeta({ share }: { share: Share }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const Icon = AUDIENCE_ICON[share.audience] ?? Globe
  const expired = share.expires_at ? new Date(share.expires_at).getTime() < Date.now() : false
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <Badge><Icon className="size-3" aria-hidden="true" />{t(`share.audiences.${share.audience}`)}</Badge>
      <Badge>{t(share.type === 'album' ? 'share.typeAlbum' : 'share.typeMedia', { count: share.media_count ?? 0 })}</Badge>
      {share.has_password && <Badge><Lock className="size-3" aria-hidden="true" />{t('share.protected')}</Badge>}
      {share.revoked_at ? (
        <Badge tone="danger">{t('share.revoked')}</Badge>
      ) : share.expires_at ? (
        <Badge tone={expired ? 'danger' : 'neutral'}>
          {expired ? t('share.expired') : t('share.expiresOn', { date: formatDate(share.expires_at, locale) })}
        </Badge>
      ) : (
        <Badge>{t('share.noExpiry')}</Badge>
      )}
      {share.view_count != null && <span>{t('share.views', { count: share.view_count })}</span>}
    </div>
  )
}

function ListSkeleton() {
  return <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
}

function SharedWithMe() {
  const { t } = useTranslation()
  const q = useSharedWithMe()
  if (q.isLoading) return <ListSkeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data?.length) return <EmptyState icon={Share2} title={t('shared.withMeEmptyTitle')} description={t('shared.withMeEmptyBody')} />
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {q.data.map((s) => (
        <li key={s.id}>
          <Card className="flex items-center justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h3 className="truncate font-medium">{s.title || t('share.untitled')}</h3>
              {(s.created_by ?? s.owner) && (
                <p className="text-xs text-muted">{t('shared.sharedBy', { name: (s.created_by ?? s.owner)!.name })}</p>
              )}
              <ShareMeta share={s} />
            </div>
            <Button variant="secondary" asChild>
              <Link to={`/shared/${s.id}`}><ExternalLink /> {t('common.open')}</Link>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  )
}

function MyLinks() {
  const { t } = useTranslation()
  const q = useMyShares()
  const copy = useCopy()
  const revoke = useRevokeShare()
  const errorMessage = useErrorMessage()
  const [target, setTarget] = useState<Share | null>(null)
  if (q.isLoading) return <ListSkeleton />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!q.data?.length) return <EmptyState icon={Share2} title={t('shared.mineEmptyTitle')} description={t('shared.mineEmptyBody')} />
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {q.data.map((s) => (
          <li key={s.id}>
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <h3 className="truncate font-medium">{s.title || t('share.untitled')}</h3>
                <ShareMeta share={s} />
              </div>
              <div className="flex gap-2">
                {s.url && !s.revoked_at && (
                  <Button variant="secondary" size="sm" onClick={() => copy(absoluteUrl(s.url))}>
                    <Copy /> {t('common.copyLink')}
                  </Button>
                )}
                {!s.revoked_at && (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setTarget(s)}>
                    <Link2Off /> {t('share.revoke')}
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={t('share.revokeTitle')}
        description={t('share.revokeBody')}
        confirmLabel={t('share.revoke')}
        destructive
        pending={revoke.isPending}
        onConfirm={() =>
          target &&
          revoke.mutate(target.id, {
            onSuccess: () => { toast.success(t('share.revokedToast')); setTarget(null) },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </>
  )
}

export default function SharedPage() {
  const { t } = useTranslation()
  return (
    <>
      <PageHeader title={t('shared.title')} />
      <Tabs defaultValue="with-me" className="flex flex-col gap-5">
        <TabsList className="self-start">
          <TabsTrigger value="with-me">{t('shared.withMe')}</TabsTrigger>
          <TabsTrigger value="mine">{t('shared.mine')}</TabsTrigger>
        </TabsList>
        <TabsContent value="with-me"><SharedWithMe /></TabsContent>
        <TabsContent value="mine"><MyLinks /></TabsContent>
      </Tabs>
    </>
  )
}
