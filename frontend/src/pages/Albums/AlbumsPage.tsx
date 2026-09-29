import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Images, Plus, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAlbums } from '@/hooks/useAlbums'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { AlbumCard } from '@/components/albums/AlbumCard'
import { CreateAlbumDialog } from '@/components/albums/CreateAlbumDialog'

export default function AlbumsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const debounced = useDebouncedValue(q, 300)
  const albums = useAlbums(debounced)
  const list = albums.data?.data ?? []

  return (
    <>
      <PageHeader
        title={t('albums.title')}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input className="w-56 pl-9" type="search" aria-label={t('albums.searchAlbums')} placeholder={t('albums.searchAlbums')} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> {t('albums.new')}
            </Button>
          </>
        }
      />
      {albums.isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : albums.error ? (
        <ErrorState error={albums.error} onRetry={() => albums.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Images}
          title={debounced ? t('albums.noResults') : t('albums.emptyTitle')}
          description={debounced ? undefined : t('albums.emptyBody')}
          action={!debounced && <Button onClick={() => setCreateOpen(true)}><Plus /> {t('albums.new')}</Button>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {list.map((a) => (
            <li key={a.id}><AlbumCard album={a} /></li>
          ))}
        </ul>
      )}
      <CreateAlbumDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(a) => navigate(`/albums/${a.id}`)} />
    </>
  )
}
