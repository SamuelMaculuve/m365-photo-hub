import { useMemo } from 'react'
import { Heart } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePhotos } from '@/hooks/usePhotos'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/states'
import { TypeFilterChips } from '@/components/photos/FilterChips'
import { MediaBrowser } from '@/components/photos/MediaBrowser'
import { useTypeParam } from '@/pages/Photos/PhotosPage'

export default function FavouritesPage() {
  const { t } = useTranslation()
  const [type, setType] = useTypeParam()
  const filters = useMemo(() => ({ favourite: true, type }), [type])
  const photos = usePhotos(filters)
  return (
    <>
      <PageHeader title={t('favourites.title')} description={t('favourites.subtitle')} actions={<TypeFilterChips value={type} onChange={setType} />} />
      <MediaBrowser
        query={photos}
        label={t('favourites.title')}
        empty={<EmptyState icon={Heart} title={t('favourites.emptyTitle')} description={t('favourites.emptyBody')} />}
      />
    </>
  )
}
