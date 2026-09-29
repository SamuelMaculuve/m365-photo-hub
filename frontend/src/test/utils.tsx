import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { AppProviders } from '@/App'
import type { CurrentUser, Media, Person } from '@/types'
import { qk } from '@/lib/queryKeys'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

export function LocationProbe() {
  const loc = useLocation()
  return <output data-testid="location">{loc.pathname + loc.search}</output>
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path = '*', client = createTestQueryClient() }: { route?: string; path?: string; client?: QueryClient } = {},
) {
  const wrap = (children: ReactNode) => (
    <AppProviders client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={<>{children}<LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </AppProviders>
  )
  const utils = render(wrap(ui))
  return { ...utils, client }
}

export function makeMedia(id: number, overrides: Partial<Media> = {}): Media {
  const date = overrides.sort_at ?? new Date(Date.UTC(2026, 8, 28 - (id % 20), 12, 0, 0)).toISOString()
  return {
    id,
    name: `IMG_${id}.jpg`,
    type: 'image',
    mime_type: 'image/jpeg',
    width: 4032,
    height: 3024,
    duration_ms: null,
    taken_at: date,
    sort_at: date,
    size: 3_481_223,
    library_id: 1,
    is_favourite: false,
    thumbnails: {
      small: `/api/photos/${id}/thumbnail/small`,
      medium: `/api/photos/${id}/thumbnail/medium`,
      large: `/api/photos/${id}/thumbnail/large`,
      xlarge: `/api/photos/${id}/thumbnail/xlarge`,
    },
    stream_url: null,
    ...overrides,
  }
}

export function makeUser(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 1,
    name: 'Ana',
    email: 'ana@org.mz',
    locale: 'pt',
    role: 'editor',
    permissions: { admin: false, manage_libraries: false, manage_sync: false, manage_users: false, view_audit: false, delete_from_source: false, upload: true },
    libraries: [],
    features: { semantic_search: false, faces: true },
    ...overrides,
  }
}

export function makePerson(id: number, overrides: Partial<Person> = {}): Person {
  return {
    id,
    name: `Pessoa ${id}`,
    face_count: 23,
    is_hidden: false,
    thumbnail: `/api/people/${id}/thumbnail`,
    can: { update: true, suppress: false },
    ...overrides,
  }
}

/** QueryClient com o utilizador actual já em cache (useCurrentUser). */
export function clientWithUser(user: CurrentUser = makeUser()) {
  const client = createTestQueryClient()
  client.setQueryData(qk.me, user)
  return client
}
