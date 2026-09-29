import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeMedia, renderWithProviders } from '@/test/utils'
import { ApiError } from '@/services/api'
import { sharesService } from '@/services/shares'
import PublicSharePage from './PublicSharePage'

vi.mock('@/services/shares', async (orig) => {
  const mod = await orig<typeof import('@/services/shares')>()
  return { ...mod, sharesService: { ...mod.sharesService, getPublic: vi.fn() } }
})

const locked = () => new ApiError({ status: 423, code: 'share_password_required', message: 'Protegido' })

describe('PublicSharePage', () => {
  it('asks for a password, rejects a wrong one and shows the items with the right one', async () => {
    vi.mocked(sharesService.getPublic).mockImplementation(async (_token, password) => {
      if (password !== 'segredo') throw locked()
      return { title: 'Formação CRP IV', type: 'album', expires_at: null, items: [makeMedia(1), makeMedia(2)] }
    })
    const user = userEvent.setup()
    renderWithProviders(<PublicSharePage />, { route: '/s/abc123', path: '/s/:token' })

    expect(await screen.findByText('Link protegido')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Palavra-passe'), 'errada')
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByText('Palavra-passe incorrecta.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Palavra-passe'))
    await user.type(screen.getByLabelText('Palavra-passe'), 'segredo')
    await user.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(await screen.findByRole('heading', { name: 'Formação CRP IV' })).toBeInTheDocument()
    expect(screen.getByAltText(/IMG_1\.jpg/)).toBeInTheDocument()
    expect(sharesService.getPublic).toHaveBeenLastCalledWith('abc123', 'segredo')
  })

  it('shows the expired state for 410', async () => {
    vi.mocked(sharesService.getPublic).mockRejectedValue(new ApiError({ status: 410, code: 'share_expired', message: '' }))
    renderWithProviders(<PublicSharePage />, { route: '/s/old', path: '/s/:token' })
    expect(await screen.findByText('Link expirado')).toBeInTheDocument()
  })

  it('shows not found for 404', async () => {
    vi.mocked(sharesService.getPublic).mockRejectedValue(new ApiError({ status: 404, code: 'not_found', message: '' }))
    renderWithProviders(<PublicSharePage />, { route: '/s/nope', path: '/s/:token' })
    expect(await screen.findByText('Link inválido')).toBeInTheDocument()
  })
})
