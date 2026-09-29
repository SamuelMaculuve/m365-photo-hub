import { useState } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeMedia, renderWithProviders } from '@/test/utils'
import { photosService } from '@/services/photos'
import { PhotoViewer } from './PhotoViewer'

vi.mock('@/services/photos', () => ({
  photosService: {
    get: vi.fn(),
    favourite: vi.fn(),
    trash: vi.fn(),
    downloadUrl: (id: number) => `/api/photos/${id}/download`,
  },
}))

const items = [makeMedia(1), makeMedia(2), makeMedia(3)]

function Harness({ onClose, start = 2 }: { onClose: () => void; start?: number }) {
  const [id, setId] = useState(start)
  return <PhotoViewer items={items} photoId={id} onNavigate={setId} onClose={onClose} />
}

describe('PhotoViewer', () => {
  beforeEach(() => {
    vi.mocked(photosService.get).mockImplementation(async (id: number) => ({
      ...items[id - 1],
      folder_path: '/Fotos/2026',
      web_url: 'https://org.sharepoint.com/x',
      download_url: `/api/photos/${id}/download`,
      source_created_at: null,
      source_modified_at: null,
      metadata: { camera_make: 'Apple', camera_model: 'iPhone 15' },
      location: { latitude: -25.9692, longitude: 32.5732, place: 'Maputo' },
      albums: [],
      tags: [],
      library: { id: 1, name: 'Fotos Institucionais' },
      hidden_at: null,
      can: { trash: true, restore: false, delete_from_source: false, share: true, add_to_album: true },
    }))
    vi.mocked(photosService.favourite).mockResolvedValue(true)
  })

  it('is an accessible dialog with progressive image loading', async () => {
    renderWithProviders(<Harness onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'IMG_2.jpg' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByAltText(/IMG_2\.jpg/)).toHaveAttribute('src', '/api/photos/2/thumbnail/large')
    expect(await screen.findByRole('link', { name: 'Abrir no Microsoft 365' })).toHaveAttribute('href', 'https://org.sharepoint.com/x')
  })

  it('navigates with ← and → and closes with Esc', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<Harness onClose={onClose} />)
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog', { name: 'IMG_3.jpg' })).toBeInTheDocument()
    await user.keyboard('{ArrowRight}') // já no fim: fica
    expect(screen.getByRole('dialog', { name: 'IMG_3.jpg' })).toBeInTheDocument()
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('dialog', { name: 'IMG_1.jpg' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles favourite via the service', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness onClose={vi.fn()} start={1} />)
    await user.click(screen.getByRole('button', { name: 'Adicionar aos favoritos' }))
    await waitFor(() => expect(photosService.favourite).toHaveBeenCalledWith(1, true))
  })

  it('shows the info panel with location link', async () => {
    const user = userEvent.setup()
    renderWithProviders(<Harness onClose={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Informações' }))
    const link = await screen.findByRole('link', { name: 'Maputo' })
    expect(link).toHaveAttribute('href', '/places?place=Maputo')
    expect(screen.getByText('Apple iPhone 15')).toBeInTheDocument()
  })

  it('shows a friendly message when the image cannot be fetched from Microsoft 365', async () => {
    const { fireEvent } = await import('@testing-library/react')
    renderWithProviders(<Harness onClose={vi.fn()} />)
    const img = screen.getByAltText(/IMG_2\.jpg/)
    fireEvent.error(img) // large falha → tenta xlarge
    fireEvent.error(screen.getByAltText(/IMG_2\.jpg/))
    expect(await screen.findByText(/temporariamente indisponível porque o ficheiro não pôde ser obtido do Microsoft 365/)).toBeInTheDocument()
  })
})
