import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clientWithUser, makeMedia, makeUser, renderWithProviders } from '@/test/utils'
import { peopleService } from '@/services/people'
import type { MediaDetail } from '@/types'
import { InfoPanel } from './InfoPanel'

vi.mock('@/services/people', () => ({
  peopleService: { removeFace: vi.fn(), thumbnailUrl: (id: number) => `/api/people/${id}/thumbnail` },
}))
vi.mock('@/services/auth', () => ({ authService: { me: vi.fn(() => new Promise(() => {})) } }))
// jsdom não suporta o Leaflet: substituir o módulo lazy dos mapas.
vi.mock('@/components/map/LeafletMaps', () => ({
  MiniMap: ({ ariaLabel, variant }: { ariaLabel: string; variant: string }) => (
    <div role="region" aria-label={ariaLabel} data-variant={variant} />
  ),
  PlacesMap: () => null,
}))

const item = makeMedia(1)
const detail: MediaDetail = {
  ...item,
  folder_path: null,
  web_url: null,
  download_url: '/api/photos/1/download',
  source_created_at: null,
  source_modified_at: null,
  metadata: null,
  location: null,
  albums: [],
  tags: [],
  library: null,
  hidden_at: null,
  can: { trash: true, restore: false, delete_from_source: false, share: true, add_to_album: true },
  people: [
    { id: 7, name: 'Maria', face_id: 120, box: [0.41, 0.22, 0.05, 0.08] },
    { id: 9, name: null, face_id: 121, box: [0.1, 0.2, 0.05, 0.08] },
  ],
}

const renderPanel = (role: 'editor' | 'viewer') =>
  renderWithProviders(
    <InfoPanel item={item} detail={detail} loading={false} error={null} locale="pt" onClose={vi.fn()} />,
    { client: clientWithUser(makeUser({ role })) },
  )

describe('InfoPanel people', () => {
  it('shows people chips linking to each person', () => {
    renderPanel('viewer')
    expect(screen.getByText('Pessoas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Maria' })).toHaveAttribute('href', '/people/7')
    expect(screen.getByRole('link', { name: 'Sem nome' })).toHaveAttribute('href', '/people/9')
    expect(document.querySelector('img[src="/api/people/7/thumbnail"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Não é esta pessoa/ })).not.toBeInTheDocument()
  })

  it('lets editors remove a wrongly grouped face', async () => {
    vi.mocked(peopleService.removeFace).mockResolvedValue()
    const user = userEvent.setup()
    renderPanel('editor')
    await user.click(screen.getByRole('button', { name: 'Não é esta pessoa: remover Maria desta fotografia' }))
    await waitFor(() => expect(peopleService.removeFace).toHaveBeenCalledWith(120))
  })
})

describe('InfoPanel location', () => {
  const renderWithLocation = (location: MediaDetail['location']) =>
    renderWithProviders(
      <InfoPanel item={item} detail={{ ...detail, location }} loading={false} error={null} locale="pt" onClose={vi.fn()} />,
      { client: clientWithUser(makeUser({ role: 'viewer' })) },
    )

  it('shows "perto de" wording, the region and a map with an OSM link when outside the named place', async () => {
    renderWithLocation({
      latitude: -25.9, longitude: 32.45, place: 'Maputo', region: 'Maputo Cidade', country: 'MZ', distance_km: 12.4, source: 'exif',
    })
    expect(screen.getByText(/perto de/)).toHaveTextContent('perto de Maputo (~12 km)')
    expect(screen.getByRole('link', { name: 'Maputo' })).toHaveAttribute('href', '/places?place=Maputo')
    // Moçambique é omitido; só a região aparece.
    expect(screen.getByText('Maputo Cidade')).toBeInTheDocument()
    expect(screen.queryByText(/Moçambique/)).not.toBeInTheDocument()
    const map = await screen.findByRole('region', { name: /Mapa da localização da fotografia/ })
    expect(map).toHaveAttribute('data-variant', 'point')
    const osm = screen.getByRole('link', { name: /Abrir no mapa/ })
    expect(osm).toHaveAttribute('href', 'https://www.openstreetmap.org/?mlat=-25.90000&mlon=32.45000#map=15/-25.90000/32.45000')
    expect(osm).toHaveAttribute('target', '_blank')
    expect(osm.getAttribute('rel')).toContain('noopener')
  })

  it('shows plain place text when inside the place (distance_km null) and small distances with one decimal', () => {
    const { unmount } = renderWithLocation({ latitude: -12.97, longitude: 40.52, place: 'Pemba', distance_km: null, source: 'graph' })
    expect(screen.queryByText(/perto de/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pemba' })).toBeInTheDocument()
    unmount()
    renderWithLocation({ latitude: -12.9, longitude: 40.5, place: 'Pemba', distance_km: 2.46, source: 'graph' })
    expect(screen.getByText(/perto de/)).toHaveTextContent('perto de Pemba (~2,5 km)')
  })

  it('shows the country name for places outside Mozambique', () => {
    renderWithLocation({ latitude: -26.2, longitude: 28.04, place: 'Joanesburgo', region: 'Gauteng', country: 'ZA', distance_km: null, source: 'exif' })
    expect(screen.getByText(/Gauteng, (África do Sul|South Africa|ZA)/)).toBeInTheDocument()
  })

  it('labels estimated locations as possible and draws an area', async () => {
    renderWithLocation({ latitude: -19.84, longitude: 34.84, place: 'Beira', distance_km: null, source: 'estimated' })
    expect(screen.getByText('Local possível (estimado)')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /Mapa da localização/ })).toHaveAttribute('data-variant', 'estimated')
  })

  it('labels manual locations as approximate', () => {
    renderWithLocation({ latitude: -19.84, longitude: 34.84, place: 'Beira', distance_km: null, source: 'manual' })
    expect(screen.getByText('Local aproximado (definido manualmente)')).toBeInTheDocument()
  })

  it('shows no map when coordinates are hidden', () => {
    renderWithLocation({ latitude: null, longitude: null, place: 'Nampula', region: 'Nampula', country: 'MZ', distance_km: null, source: 'exif' })
    expect(screen.getByRole('link', { name: 'Nampula' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Mapa/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abrir no mapa/ })).not.toBeInTheDocument()
  })
})
