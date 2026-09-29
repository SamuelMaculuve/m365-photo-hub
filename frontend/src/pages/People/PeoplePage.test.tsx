import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clientWithUser, makePerson, makeUser, renderWithProviders } from '@/test/utils'
import { peopleService } from '@/services/people'
import PeoplePage from './PeoplePage'

vi.mock('@/services/people', () => ({
  peopleService: { list: vi.fn(), thumbnailUrl: (id: number) => `/api/people/${id}/thumbnail` },
}))
vi.mock('@/services/auth', () => ({ authService: { me: vi.fn(() => new Promise(() => {})) } }))


describe('PeoplePage', () => {
  beforeEach(() => {
    vi.mocked(peopleService.list).mockReset()
  })

  it('shows the disabled state when features.faces is false', () => {
    renderWithProviders(<PeoplePage />, { client: clientWithUser(makeUser({ features: { semantic_search: false, faces: false } })) })
    expect(screen.getByText('Reconhecimento de pessoas desactivado')).toBeInTheDocument()
    expect(peopleService.list).not.toHaveBeenCalled()
  })

  it('renders the people grid, unnamed people and the hidden toggle for editors', async () => {
    vi.mocked(peopleService.list).mockResolvedValue([makePerson(7, { name: 'Maria' }), makePerson(8, { name: null, face_count: 1 })])
    const user = userEvent.setup()
    renderWithProviders(<PeoplePage />, { client: clientWithUser(makeUser()) })

    expect(await screen.findByRole('link', { name: /Maria/ })).toHaveAttribute('href', '/people/7')
    expect(screen.getByAltText('Maria')).toHaveAttribute('src', '/api/people/7/thumbnail')
    expect(screen.getByAltText('Maria')).toHaveAttribute('loading', 'lazy')
    expect(screen.getByText('23 fotografias')).toBeInTheDocument()
    expect(screen.getByAltText('Pessoa sem nome')).toBeInTheDocument()
    expect(screen.getByText('Adicionar nome')).toBeInTheDocument()
    expect(screen.getByText('1 fotografia')).toBeInTheDocument()

    await user.click(screen.getByRole('switch', { name: 'Mostrar ocultas' }))
    await waitFor(() => expect(peopleService.list).toHaveBeenLastCalledWith({ q: undefined, hidden: true }))

    await user.type(screen.getByRole('searchbox', { name: 'Procurar pessoas' }), 'Mar')
    await waitFor(() => expect(peopleService.list).toHaveBeenLastCalledWith({ q: 'Mar', hidden: true }))
  })

  it('hides the hidden toggle for viewers', async () => {
    vi.mocked(peopleService.list).mockResolvedValue([makePerson(7, { can: { update: false, suppress: false } })])
    renderWithProviders(<PeoplePage />, { client: clientWithUser(makeUser({ role: 'viewer' })) })
    expect(await screen.findByText('Pessoa 7')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Mostrar ocultas' })).not.toBeInTheDocument()
  })
})
