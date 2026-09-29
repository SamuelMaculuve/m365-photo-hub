import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clientWithUser, makePerson, makeUser, renderWithProviders } from '@/test/utils'
import { peopleService } from '@/services/people'
import PersonPage from './PersonPage'

vi.mock('@/services/people', () => ({
  peopleService: {
    list: vi.fn(),
    get: vi.fn(),
    media: vi.fn(),
    update: vi.fn(),
    merge: vi.fn(),
    suppress: vi.fn(),
    thumbnailUrl: (id: number) => `/api/people/${id}/thumbnail`,
  },
}))
vi.mock('@/services/auth', () => ({ authService: { me: vi.fn(() => new Promise(() => {})) } }))

const render = (user = makeUser()) =>
  renderWithProviders(<PersonPage />, { route: '/people/7', path: '/people/:id', client: clientWithUser(user) })

describe('PersonPage', () => {
  beforeEach(() => {
    vi.mocked(peopleService.media).mockResolvedValue({ data: [], meta: { next_cursor: null } })
  })

  it('renames the person inline and saves on Enter', async () => {
    vi.mocked(peopleService.get).mockResolvedValue(makePerson(7, { name: null }))
    vi.mocked(peopleService.update).mockResolvedValue(makePerson(7, { name: 'Maria' }))
    const user = userEvent.setup()
    render()

    const input = await screen.findByRole('textbox', { name: 'Nome da pessoa' })
    expect(input).toHaveAttribute('placeholder', 'Adicionar nome')
    await user.type(input, '  Maria {Enter}')
    await waitFor(() => expect(peopleService.update).toHaveBeenCalledWith(7, { name: 'Maria' }))
    expect(peopleService.update).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Não há fotografias desta pessoa.')).toBeInTheDocument()
  })

  it('shows a read-only name without edit permission', async () => {
    vi.mocked(peopleService.get).mockResolvedValue(makePerson(7, { name: 'Maria', can: { update: false, suppress: false } }))
    render(makeUser({ role: 'viewer' }))
    expect(await screen.findByRole('heading', { name: 'Maria' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mais acções' })).not.toBeInTheDocument()
  })

  it('requires typing EXCLUIR before excluding from recognition', async () => {
    vi.mocked(peopleService.get).mockResolvedValue(makePerson(7, { name: 'Maria', can: { update: true, suppress: true } }))
    vi.mocked(peopleService.suppress).mockResolvedValue()
    const user = userEvent.setup()
    render(makeUser({ role: 'super_admin' }))

    await user.click(await screen.findByRole('button', { name: 'Mais acções' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Excluir do reconhecimento' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('impede')
    const confirm = screen.getByRole('button', { name: 'Excluir do reconhecimento' })
    expect(confirm).toBeDisabled()
    const field = screen.getByLabelText('Escreva EXCLUIR para confirmar')
    await user.type(field, 'excluir')
    expect(confirm).toBeDisabled()
    await user.clear(field)
    await user.type(field, 'EXCLUIR')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(peopleService.suppress).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Pessoa excluída do reconhecimento.')).toBeInTheDocument()
  })
})
