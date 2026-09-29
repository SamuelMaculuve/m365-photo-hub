import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils'
import LoginPage from './LoginPage'

vi.mock('@/services/auth', async (orig) => {
  const mod = await orig<typeof import('@/services/auth')>()
  return {
    ...mod,
    authService: { ...mod.authService, config: vi.fn().mockResolvedValue({ dev_login: true, app_name: 'Fotos', microsoft_configured: true }) },
  }
})

describe('LoginPage', () => {
  it('renders the Microsoft sign-in link pointing to the backend redirect', async () => {
    renderWithProviders(<LoginPage />, { route: '/login' })
    const link = screen.getByRole('link', { name: /Entrar com a Microsoft/i })
    expect(link).toHaveAttribute('href', '/auth/microsoft/redirect')
    expect(await screen.findByText('Modo de desenvolvimento')).toBeInTheDocument()
  })

  it('shows the error passed in ?error=', () => {
    renderWithProviders(<LoginPage />, { route: '/login?error=session_expired' })
    expect(screen.getByRole('alert')).toHaveTextContent('A sua sessão expirou')
  })
})
