import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import type { CurrentUser } from '@/types'
import { authService } from '@/services/auth'
import { LinkedAccountsCard } from './LinkedAccountsCard'

vi.mock('@/services/auth', async (orig) => {
  const mod = await orig<typeof import('@/services/auth')>()
  return { ...mod, authService: { ...mod.authService, unlinkIdentity: vi.fn() } }
})

const h2n = { id: 1, name: 'H2N', slug: 'h2n', color: '#0F6CBD' }
const tvs = { id: 2, name: 'TV Surdo', slug: 'tvsurdo', color: null }

function user(identities: CurrentUser['identities']): CurrentUser {
  return {
    id: 7,
    name: 'Samuel',
    email: 'samuel@h2n.org.mz',
    locale: 'pt',
    role: 'viewer',
    permissions: { admin: false, manage_libraries: false, manage_sync: false, manage_users: false, view_audit: false, delete_from_source: false, upload: false },
    libraries: [],
    identities,
  }
}

describe('LinkedAccountsCard', () => {
  it('lists linked accounts with their organisation and links to the backend flow', () => {
    renderWithProviders(
      <LinkedAccountsCard
        user={user([
          { id: 10, email: 'samuel@h2n.org.mz', organization: h2n, last_login_at: null },
          { id: 11, email: 'samuel@tvsurdo.com', organization: tvs, last_login_at: null },
        ])}
      />,
    )
    expect(screen.getByText('samuel@tvsurdo.com')).toBeInTheDocument()
    expect(screen.getByText('TV Surdo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ligar outra conta Microsoft/i })).toHaveAttribute('href', '/auth/microsoft/link')
    expect(screen.getAllByRole('button', { name: /Desligar a conta/i })).toHaveLength(2)
  })

  it('never offers to unlink the last account', () => {
    renderWithProviders(<LinkedAccountsCard user={user([{ id: 10, email: 'samuel@h2n.org.mz', organization: h2n, last_login_at: null }])} />)
    expect(screen.queryByRole('button', { name: /Desligar/i })).not.toBeInTheDocument()
  })

  it('unlinks an account', async () => {
    vi.mocked(authService.unlinkIdentity).mockResolvedValue(user([]))
    renderWithProviders(
      <LinkedAccountsCard
        user={user([
          { id: 10, email: 'samuel@h2n.org.mz', organization: h2n, last_login_at: null },
          { id: 11, email: 'samuel@tvsurdo.com', organization: tvs, last_login_at: null },
        ])}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Desligar a conta samuel@tvsurdo.com' }))
    expect(authService.unlinkIdentity).toHaveBeenCalledWith(11, expect.anything())
  })
})
