import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SlidersHorizontal, Search as SearchIcon, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SearchFilters } from '@/types'
import { useSearch } from '@/hooks/useSearch'
import { useCurrentUser } from '@/hooks/useAuth'
import { Switch } from '@/components/ui/switch'
import { filtersFromSearchParams, hasActiveFilters, searchParamsFromFilters } from '@/lib/search'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/states'
import { MediaBrowser } from '@/components/photos/MediaBrowser'
import { SearchBox } from '@/components/search/SearchBox'
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel'
import { InterpretedChips } from '@/components/search/InterpretedChips'

export default function SearchPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const key = params.toString().replace(/(^|&)photo=\d+/, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => filtersFromSearchParams(params), [key])
  const [showFilters, setShowFilters] = useState(hasActiveFilters(filters))
  const search = useSearch(filters)
  const hasAny = Boolean(filters.q) || hasActiveFilters(filters)

  const apply = (f: SearchFilters) => setParams(searchParamsFromFilters(f), { replace: true })
  const semanticAvailable = Boolean(useCurrentUser()?.features?.semantic_search)

  return (
    <>
      <div className="mb-4 sm:hidden"><SearchBox /></div>
      <PageHeader
        title={filters.q ? t('search.resultsFor', { q: filters.q }) : t('search.title')}
        actions={
          <Button variant={showFilters ? 'primary' : 'secondary'} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal /> {t('search.filters')}
          </Button>
        }
      />
      {semanticAvailable && (
        <label className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <Sparkles className="size-4 shrink-0 text-accent" aria-hidden="true" />
          <span className="flex-1">
            <span className="block font-medium">{t('search.semantic')}</span>
            <span className="block text-xs text-muted">{t('search.semanticHint')}</span>
          </span>
          <Switch
            checked={Boolean(filters.semantic)}
            onCheckedChange={(v) => apply({ ...filters, semantic: v || undefined })}
            aria-label={t('search.semantic')}
          />
        </label>
      )}
      {showFilters && <div className="mb-4"><SearchFiltersPanel value={filters} onApply={apply} /></div>}
      <div className="mb-4"><InterpretedChips value={search.meta?.interpreted} /></div>
      {!hasAny ? (
        <EmptyState icon={SearchIcon} title={t('search.startTitle')} description={t('search.startBody')} />
      ) : (
        <MediaBrowser
          query={search}
          groupByDay={false}
          label={t('search.title')}
          empty={<EmptyState icon={SearchIcon} title={t('search.noResultsTitle')} description={t('search.noResultsBody')} />}
        />
      )}
    </>
  )
}
