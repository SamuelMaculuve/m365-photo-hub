import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeMedia, renderWithProviders } from '@/test/utils'
import { photosService } from '@/services/photos'
import { DeleteFromSourceDialog } from './DeleteFromSourceDialog'
import { TrashItemDialog } from './TrashItemDialog'

vi.mock('@/services/photos', () => ({
  photosService: { get: vi.fn(), restore: vi.fn(), deleteFromSource: vi.fn() },
}))

describe('Delete from Microsoft 365 confirmation', () => {
  it('requires typing DELETE exactly', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<DeleteFromSourceDialog open onOpenChange={vi.fn()} name="IMG_1.jpg" onConfirm={onConfirm} />)
    const button = screen.getByRole('button', { name: 'Eliminar do Microsoft 365' })
    expect(button).toBeDisabled()
    expect(screen.getByText(/de onde um administrador os pode recuperar/)).toBeInTheDocument()
    const input = screen.getByLabelText('Escreva DELETE para confirmar')
    await user.type(input, 'delete')
    expect(button).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'DELETE')
    expect(button).toBeEnabled()
    await user.click(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('only offers deletion when can.delete_from_source and calls the service', async () => {
    vi.mocked(photosService.get).mockResolvedValue({ ...makeMedia(1), can: { delete_from_source: true } } as never)
    vi.mocked(photosService.deleteFromSource).mockResolvedValue()
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<TrashItemDialog item={makeMedia(1)} onClose={onClose} />)
    await user.click(await screen.findByRole('button', { name: 'Eliminar do Microsoft 365' }))
    await user.type(screen.getByLabelText('Escreva DELETE para confirmar'), 'DELETE')
    const confirm = screen.getAllByRole('button', { name: 'Eliminar do Microsoft 365' }).at(-1)!
    await user.click(confirm)
    await waitFor(() => expect(photosService.deleteFromSource).toHaveBeenCalledWith(1))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('hides deletion when not allowed', async () => {
    vi.mocked(photosService.get).mockResolvedValue({ ...makeMedia(1), can: { delete_from_source: false } } as never)
    renderWithProviders(<TrashItemDialog item={makeMedia(1)} onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    await waitFor(() => expect(photosService.get).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Eliminar do Microsoft 365' })).not.toBeInTheDocument()
  })
})
