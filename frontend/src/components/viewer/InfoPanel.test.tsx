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
