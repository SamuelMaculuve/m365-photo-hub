import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeMedia, renderWithProviders } from '@/test/utils'
import { photosService } from '@/services/photos'
import { MediaBrowser, type MediaQueryLike } from './MediaBrowser'

vi.mock('@/services/photos', () => ({
  photosService: {
    get: vi.fn(),
    favourite: vi.fn(),
    bulk: vi.fn(),
    trash: vi.fn(),
    downloadUrl: (id: number) => `/api/photos/${id}/download`,
  },
}))

const items = [makeMedia(1), makeMedia(2), makeMedia(3, { type: 'video', duration_ms: 65_000, stream_url: '/api/photos/3/stream' })]

function query(overrides: Partial<MediaQueryLike> = {}): MediaQueryLike {
  return {
    items,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...overrides,
  } as unknown as MediaQueryLike
}

describe('PhotoGrid / MediaBrowser', () => {
  beforeEach(() => {
    vi.mocked(photosService.get).mockImplementation((id: number) => new Promise(() => void id))
    vi.mocked(photosService.favourite).mockResolvedValue(true)
  })

  it('renders thumbnails with alt text, month headers and video duration', () => {
    renderWithProviders(<MediaBrowser query={query()} label="Fotos" empty={<p>vazio</p>} />)
    const img = screen.getByAltText(/IMG_1\.jpg, 2\d de setembro de 2026/)
    expect(img).toHaveAttribute('src', '/api/photos/1/thumbnail/medium')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getByRole('heading', { name: /setembro de 2026/i, level: 2 })).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
  })

  it('opens the viewer (and ?photo= in the URL) when a photo is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MediaBrowser query={query()} label="Fotos" empty={<p>vazio</p>} />, { route: '/' })
    await user.click(screen.getByRole('button', { name: /^IMG_2\.jpg,/ }))
    const dialog = await screen.findByRole('dialog', { name: 'IMG_2.jpg' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/?photo=2')
    expect(screen.getByText('2 de 3')).toBeInTheDocument()
  })

  it('toggles favourite through the service from the tile heart', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MediaBrowser query={query()} label="Fotos" empty={<p>vazio</p>} />)
    await user.click(screen.getAllByRole('button', { name: 'Adicionar aos favoritos' })[0])
    await waitFor(() => expect(photosService.favourite).toHaveBeenCalledWith(1, true))
  })

  it('enters selection mode and shows the selection bar', async () => {
    const user = userEvent.setup()
    renderWithProviders(<MediaBrowser query={query()} label="Fotos" empty={<p>vazio</p>} />)
    await user.click(screen.getByRole('button', { name: 'Seleccionar IMG_1.jpg' }))
    expect(screen.getByRole('toolbar', { name: 'Acções da selecção' })).toHaveTextContent('1 seleccionado')
  })

  it('shows the empty state when there are no items', () => {
    renderWithProviders(<MediaBrowser query={query({ items: [] })} label="Fotos" empty={<p>vazio</p>} />)
    expect(screen.getByText('vazio')).toBeInTheDocument()
  })
})
