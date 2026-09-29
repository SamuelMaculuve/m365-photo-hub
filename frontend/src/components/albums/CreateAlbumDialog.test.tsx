import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { albumsService } from '@/services/albums'
import { CreateAlbumDialog } from './CreateAlbumDialog'

vi.mock('@/services/albums', () => ({
  albumsService: { create: vi.fn() },
}))

describe('CreateAlbumDialog', () => {
  it('validates the name and submits the form', async () => {
    vi.mocked(albumsService.create).mockResolvedValue({ id: 9, name: 'Viagem' } as never)
    const onCreated = vi.fn()
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<CreateAlbumDialog open onOpenChange={onOpenChange} onCreated={onCreated} />)

    await user.click(screen.getByRole('button', { name: 'Criar' }))
    expect(screen.getByText('Indique um nome para o álbum.')).toBeInTheDocument()
    expect(albumsService.create).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('Nome'), 'Viagem')
    await user.selectOptions(screen.getByLabelText('Visibilidade'), 'organisation')
    await user.click(screen.getByRole('button', { name: 'Criar' }))

    await waitFor(() =>
      expect(vi.mocked(albumsService.create).mock.calls[0][0]).toEqual({ name: 'Viagem', description: null, visibility: 'organisation' }),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 9 })))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
