import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { Album, Folder, MapPin, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchSuggestions } from '@/hooks/useSearch'
import { searchUrl } from '@/lib/search'
import { cn } from '@/lib/utils'

interface Suggestion {
  key: string
  label: string
  icon: typeof Folder
  to: string
}

export function SearchBox({ className }: { className?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const id = useId()
  const urlQ = location.pathname === '/search' ? params.get('q') ?? '' : ''
  const [q, setQ] = useState(urlQ)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const suggestions = useSearchSuggestions(open ? q : '')

  useEffect(() => setQ(urlQ), [urlQ])

  const items = useMemo<Suggestion[]>(() => {
    const d = suggestions.data
    if (!d) return []
    return [
      ...(d.albums ?? []).slice(0, 4).map((a) => ({ key: `a-${a.id}`, label: a.name, icon: Album, to: `/albums/${a.id}` })),
      ...(d.places ?? []).slice(0, 4).map((p) => ({ key: `p-${p}`, label: p, icon: MapPin, to: `/places?place=${encodeURIComponent(p)}` })),
      ...(d.folders ?? []).slice(0, 4).map((f) => ({ key: `f-${f}`, label: f, icon: Folder, to: `/search?folder=${encodeURIComponent(f)}` })),
    ]
  }, [suggestions.data])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    setActive(-1)
    navigate(to)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(-1, a - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (active >= 0 && items[active]) go(items[active].to)
      else if (q.trim()) go(searchUrl(q))
    }
  }

  const showList = open && q.trim().length >= 2 && items.length > 0
  const listId = `${id}-list`

  return (
    <div ref={wrapRef} className={cn('relative w-full max-w-2xl', className)}>
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-full border border-transparent bg-surface-2 pl-11 pr-10 text-sm placeholder:text-muted focus:border-border focus:bg-surface focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button
            type="button"
            aria-label={t('search.clear')}
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </form>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('search.suggestions')}
          className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-lg"
        >
          {items.map((s, i) => {
            const Icon = s.icon
            return (
              <li
                key={s.key}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  go(s.to)
                }}
                className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm', i === active ? 'bg-surface-2' : 'hover:bg-surface-2')}
              >
                <Icon className="size-4 text-muted" aria-hidden="true" />
                <span className="truncate">{s.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
