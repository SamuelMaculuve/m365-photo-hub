import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/utils'
import { placesService } from '@/services/places'
import { SetLocationDialog } from './SetLocationDialog'

vi.mock('@/services/places', () => ({
  placesService: { catalog: vi.fn(), setLocation: vi.fn() },
}))

describe('SetLocationDialog', () => {
  it('filters the catalogue and sets the chosen place on all selected photos', async () => {
    vi.mocked(placesService.catalog).mockResolvedValue([
      { name: 'Maputo', region: 'Maputo Cidade', latitude: -25.96, longitude: 32.57 },
      { name: 'Pemba', region: 'Cabo Delgado', latitude: -12.97, longitude: 40.51 },
    ])
    vi.mocked(placesService.setLocation).mockResolvedValue({ affected: 2, place: 'Pemba' })
    const onDone = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<SetLocationDialog open onOpenChange={() => {}} mediaIds={[1, 2]} onDone={onDone} />)

    expect(await screen.findByText('Maputo')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Procurar localidade' }), 'cabo')
    expect(screen.queryByText('Maputo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: /Pemba/ }))
    await waitFor(() => expect(vi.mocked(placesService.setLocation).mock.calls[0][0]).toEqual({ ids: [1, 2], place: 'Pemba' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('can remove the location', async () => {
    vi.mocked(placesService.catalog).mockResolvedValue([])
    vi.mocked(placesService.setLocation).mockResolvedValue({ affected: 1, place: null })
    const user = userEvent.setup()
    renderWithProviders(<SetLocationDialog open onOpenChange={() => {}} mediaIds={[5]} />)

    await user.click(await screen.findByRole('button', { name: 'Remover local' }))
    await waitFor(() => expect(vi.mocked(placesService.setLocation).mock.calls.at(-1)?.[0]).toEqual({ ids: [5], clear: true }))
  })
})
