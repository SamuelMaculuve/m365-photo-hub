import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clientWithUser, makeMedia, renderWithProviders } from '@/test/utils'
import { placesService } from '@/services/places'
import type { Place } from '@/types'
import PlacesPage from './PlacesPage'

vi.mock('@/services/places', () => ({ placesService: { list: vi.fn() }, librariesService: { list: vi.fn() } }))
vi.mock('@/services/auth', () => ({ authService: { me: vi.fn(() => new Promise(() => {})) } }))
// jsdom não suporta o Leaflet: substituir o módulo lazy dos mapas por uma lista simples.
vi.mock('@/components/map/LeafletMaps', () => ({
  MiniMap: () => null,
  PlacesMap: ({ places, ariaLabel, onOpenPlace, openLabel }: { places: Place[]; ariaLabel: string; onOpenPlace: (n: string) => void; openLabel: string }) => (
    <div role="region" aria-label={ariaLabel}>
      {places.map((p) => (
        <button key={p.name} type="button" onClick={() => onOpenPlace(p.name)}>{`${openLabel}: ${p.name}`}</button>
      ))}
    </div>
  ),
}))

const places: Place[] = [
  { name: 'Maputo', admin1: 'Maputo Cidade', count: 42, latitude: -25.96, longitude: 32.58, cover: makeMedia(1) },
  { name: 'Beira', admin1: 'Sofala', count: 3, latitude: -19.84, longitude: 34.84, cover: null },
  { name: 'Sem GPS', admin1: null, count: 1, latitude: null, longitude: null, cover: null },
]

describe('PlacesPage', () => {
  beforeEach(() => {
    vi.mocked(placesService.list).mockReset().mockResolvedValue(places)
  })

  it('shows the list by default and toggles to the map view via ?view=map', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PlacesPage />, { route: '/places', client: clientWithUser() })

    expect(await screen.findByRole('link', { name: /Sem GPS/ })).toHaveAttribute('href', '/places?place=Sem%20GPS')
    expect(screen.queryByRole('region', { name: 'Mapa dos locais das fotografias' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GeoNames' })).toHaveAttribute('href', 'https://www.geonames.org')
    expect(screen.getByText(/Dados de localidades ©/)).toHaveTextContent('Dados de localidades © GeoNames (CC BY 4.0)')

    await user.click(screen.getByRole('tab', { name: /Mapa/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/places?view=map'))
    const map = await screen.findByRole('region', { name: 'Mapa dos locais das fotografias' })
    expect(map).toBeInTheDocument()
    // Só os locais com coordenadas vão para o mapa.
    expect(screen.getByRole('button', { name: 'Ver fotografias: Maputo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sem GPS/ })).not.toBeInTheDocument()
    expect(screen.getByText('1 local sem coordenadas só aparece na vista de lista.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'GeoNames' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Lista/ }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/places$/))
  })

  it('opens the map view from the URL and navigates to the place filter from a marker', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PlacesPage />, { route: '/places?view=map', client: clientWithUser() })

    expect(await screen.findByRole('tab', { name: /Mapa/ })).toHaveAttribute('aria-selected', 'true')
    await user.click(await screen.findByRole('button', { name: 'Ver fotografias: Beira' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/places?place=Beira'))
  })
})
