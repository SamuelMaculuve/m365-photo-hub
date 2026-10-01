import { describe, expect, it } from 'vitest'
import { parseSearch } from '../src/services/search-parser'
import { fold } from '../src/services/search'
import { Client, makeLibrary, makeMedia, makeUser } from './helpers'

describe('search parser', () => {
  it.each([
    ['setembro 2026', { month: 9, year: 2026, from: '2026-09-01', to: '2026-09-30', text: '' }],
    ['vídeos de 2025', { type: 'video', from: '2025-01-01', to: '2025-12-31' }],
    ['favourite photos', { favourite: true, type: 'image' }],
    ['formação maputo', { text: 'formação maputo', terms: ['formação', 'maputo'] }],
    ['set de fotos', { month: null, type: 'image', text: 'set' }],
    ['fevereiro 2024', { to: '2024-02-29' }],
  ])('%s', (q, expected) => {
    expect(parseSearch(q)).toMatchObject(expected)
  })

  it('folds accents and case', () => {
    expect(fold('Formação ÇÃO')).toBe('formacao cao')
  })
})

describe('search API', () => {
  it('understands natural queries', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    const match = await makeMedia(library, drive, { folderPath: '/Fotos/Formação', sortAt: new Date('2026-09-15T10:00:00Z') })
    await makeMedia(library, drive, { folderPath: '/Fotos/Formação', sortAt: new Date('2025-09-15T10:00:00Z') })
    await makeMedia(library, drive, { folderPath: '/Fotos/Escritório', sortAt: new Date('2026-09-15T10:00:00Z') })
    const client = await new Client().actingAs(await makeUser())

    const res = await (await client.get(`/api/search?q=${encodeURIComponent('formação setembro 2026')}`)).json()
    expect(res.data.map((m: any) => m.id)).toEqual([match.id])
    expect(res.meta.interpreted.from).toBe('2026-09-01')
    // Sem acentos também encontra.
    expect((await (await client.get('/api/search?q=formacao')).json()).data).toHaveLength(2)
  })

  it('suggests folders, places and albums', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await makeMedia(library, drive, { folderPath: '/Fotos/Formação', placeName: 'Maputo' })
    const client = await new Client().actingAs(await makeUser())
    const res = await (await client.get('/api/search/suggestions?q=form')).json()
    expect(res.data.folders).toEqual(['/Fotos/Formação'])
    expect((await (await client.get('/api/search/suggestions?q=mapu')).json()).data.places).toEqual(['Maputo'])
  })

  it('lists places from visible media', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await makeMedia(library, drive, { placeName: 'Pemba', placeRegion: 'Cabo Delgado', latitude: -12.97, longitude: 40.52 })
    await makeMedia(library, drive, { placeName: 'Pemba', placeRegion: 'Cabo Delgado', latitude: -12.95, longitude: 40.5 })
    const hidden = await makeLibrary({ visibility: 'restricted' })
    await makeMedia(hidden.library, hidden.drive, { placeName: 'Nampula' })
    const res = await (await (await new Client().actingAs(await makeUser())).get('/api/places')).json()
    expect(res.data).toHaveLength(1)
    expect(res.data[0]).toMatchObject({ name: 'Pemba', admin1: 'Cabo Delgado', count: 2, latitude: -12.96 })
    expect(res.data[0].cover.thumbnails.medium).toContain('/thumbnail/medium')
  })
})
