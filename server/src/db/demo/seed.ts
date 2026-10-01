import { count } from 'drizzle-orm'
import type { Db } from '../client'
import * as s from '../schema'
import { PLACES } from '../../services/places-data'

/** Eventos de exemplo: [pasta, nome base, localidade, mês (0-11), ano, n.º de fotos]. */
const EVENTS: [string, string, string, number, number, number][] = [
  ['Formação', 'Formação de formadores', 'Maputo', 8, 2026, 9],
  ['Reuniões', 'Reunião de coordenação', 'Matola', 7, 2026, 5],
  ['Campanhas', 'Campanha de vacinação', 'Pemba', 6, 2026, 8],
  ['Visitas', 'Visita de campo', 'Nampula', 4, 2026, 6],
  ['Eventos', 'Dia da organização', 'Maputo', 2, 2026, 7],
  ['Formação', 'Workshop de comunicação', 'Beira', 11, 2025, 6],
  ['Campanhas', 'Distribuição de material', 'Quelimane', 9, 2025, 5],
  ['Visitas', 'Visita às comunidades', 'Xai-Xai', 6, 2025, 4],
]
const CAMERAS: [string, string][] = [['Canon', 'EOS 90D'], ['Apple', 'iPhone 15'], ['Samsung', 'Galaxy S24'], ['Nikon', 'D7500']]

/** Dados de exemplo realistas para a demonstração (também usados pelo seed local: npm run db:seed). */
export async function seedDemo(db: Db): Promise<void> {
  const [{ n }] = await db.select({ n: count() }).from(s.libraries)
  if (n > 0) return // já semeada

  const [owner] = await db.insert(s.users).values({ name: 'Equipa de Comunicação', email: 'comunicacao@demo.local', role: 'editor', roleSource: 'local', isActive: false }).returning()
  const [drive] = await db.insert(s.drives).values({ driveId: 'demo-drive', driveType: 'demo', name: 'Fotos de demonstração', authMode: 'app' }).returning()
  const [library] = await db.insert(s.libraries).values({
    name: 'Fotos Institucionais (demonstração)', slug: 'demonstracao', description: 'Fotografias de exemplo geradas pela aplicação.',
    visibility: 'organisation', allowPublicLinks: true, createdBy: owner.id,
  }).returning()
  await db.insert(s.libraryRoots).values({ libraryId: library.id, driveId: drive.id, rootItemId: 'demo-root', rootPath: '/Fotos' })
  await db.insert(s.driveSyncStates).values({ driveId: drive.id, status: 'idle', lastCompletedAt: new Date(), itemsSeen: 0 })

  const rows: (typeof s.media.$inferInsert)[] = []
  let i = 0
  for (const [folder, title, placeName, month, year, total] of EVENTS) {
    const place = PLACES.find(([name]) => name === placeName)!
    for (let k = 1; k <= total; k++) {
      i++
      const taken = new Date(Date.UTC(year, month, 3 + ((i * 7) % 24), 8 + (k % 9), (i * 13) % 60))
      const [make, model] = CAMERAS[i % CAMERAS.length]
      const portrait = i % 5 === 0
      rows.push({
        libraryId: library.id, driveId: drive.id, itemId: `demo-${i}`, parentItemId: `demo-folder-${folder}`,
        name: `${title} ${String(k).padStart(2, '0')}.jpg`, folderPath: `/Fotos/${year}/${folder}`,
        mediaType: 'image', mimeType: 'image/jpeg', size: 1_800_000 + ((i * 97_331) % 2_400_000),
        width: portrait ? 3000 : 4000, height: portrait ? 4000 : 3000,
        takenAt: taken, sourceCreatedAt: taken, sourceModifiedAt: taken, sortAt: taken,
        // Coordenadas ligeiramente diferentes à volta da localidade.
        latitude: place[2] + ((i % 7) - 3) * 0.004, longitude: place[3] + ((i % 5) - 2) * 0.004,
        placeName: place[0], placeRegion: place[1], placeCountry: 'MZ', locationSource: 'graph',
        etag: `demo-etag-${i}`, ctag: `demo-ctag-${i}`, metadata: { camera_make: make, camera_model: model, iso: 100 * (1 + (i % 8)), f_number: 2.8 },
        sourceState: 'active', metadataExtracted: true, lastSeenSyncJobId: null,
      })
    }
  }
  const media = await db.insert(s.media).values(rows).returning({ id: s.media.id, folderPath: s.media.folderPath })

  const albums: [string, string, (p: string) => boolean][] = [
    ['Formações 2025–2026', 'As melhores fotografias das formações.', (p) => p.endsWith('/Formação')],
    ['Campanhas no terreno', 'Campanhas e distribuições nas províncias.', (p) => p.endsWith('/Campanhas')],
    ['Relatório anual', 'Selecção para o relatório anual.', (p) => p.endsWith('/Eventos') || p.endsWith('/Visitas')],
  ]
  for (const [name, description, match] of albums) {
    const ids = media.filter((m) => match(m.folderPath ?? '')).map((m) => m.id).slice(0, 12)
    const [album] = await db.insert(s.albums).values({ ownerId: owner.id, name, description, visibility: 'organisation', coverMediaId: ids[0] ?? null }).returning()
    if (ids.length) await db.insert(s.albumMedia).values(ids.map((mediaId, position) => ({ albumId: album.id, mediaId, position, addedBy: owner.id, addedAt: new Date() })))
  }
}
