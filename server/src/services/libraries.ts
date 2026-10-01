import { and, eq, notInArray } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import { validationError } from '../lib/errors'
import { translate, type Locale } from '../lib/i18n'
import { OneDrive } from '../microsoft/onedrive'
import { DriveAuth } from './drive-auth'

export interface LibraryInput {
  name?: string
  description?: string | null
  visibility?: 'organisation' | 'restricted'
  enabled?: boolean
  allow_public_links?: boolean
  allow_writes?: boolean
  allow_ai?: boolean
  allow_faces?: boolean
  auth_mode?: 'app' | 'delegated'
  roots?: { drive_id: string; item_id?: string | null; site_id?: string | null }[]
}

export const slugify = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export class LibraryService {
  private readonly oneDrive = new OneDrive()
  private readonly driveAuth: DriveAuth

  constructor(private readonly db: Db, private readonly locale: Locale = 'pt') {
    this.driveAuth = new DriveAuth(db)
  }

  async create(by: s.User, data: LibraryInput, ip: string | null = null): Promise<s.Library> {
    const [library] = await this.db.insert(s.libraries).values({
      name: data.name!,
      slug: await this.uniqueSlug(data.name!),
      description: data.description ?? null,
      visibility: data.visibility ?? 'restricted',
      enabled: data.enabled ?? true,
      allowPublicLinks: data.allow_public_links ?? false,
      allowWrites: data.allow_writes ?? false,
      allowAi: data.allow_ai ?? false,
      allowFaces: data.allow_faces ?? false,
      createdBy: by.id,
    }).returning()
    try {
      await this.syncRoots(library, data.roots ?? [], data.auth_mode ?? 'app', by)
    } catch (e) {
      // Sem transacções interactivas no driver HTTP: desfazer à mão se as raízes falharem.
      await this.db.delete(s.libraries).where(eq(s.libraries.id, library.id))
      throw e
    }
    await audit(this.db, { action: 'library.create', userId: by.id, subject: { type: 'library', id: library.id }, context: { name: library.name }, ip })
    return library
  }

  async update(library: s.Library, by: s.User, data: LibraryInput, ip: string | null = null): Promise<s.Library> {
    const values: Partial<typeof s.libraries.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) values.name = data.name
    if (data.description !== undefined) values.description = data.description
    if (data.visibility !== undefined) values.visibility = data.visibility
    if (data.enabled !== undefined) values.enabled = data.enabled
    if (data.allow_public_links !== undefined) values.allowPublicLinks = data.allow_public_links
    if (data.allow_writes !== undefined) values.allowWrites = data.allow_writes
    if (data.allow_ai !== undefined) values.allowAi = data.allow_ai
    if (data.allow_faces !== undefined) values.allowFaces = data.allow_faces
    const [updated] = await this.db.update(s.libraries).set(values).where(eq(s.libraries.id, library.id)).returning()
    if (data.roots !== undefined) await this.syncRoots(updated, data.roots, data.auth_mode ?? 'app', by)
    await audit(this.db, { action: 'library.update', userId: by.id, subject: { type: 'library', id: library.id }, context: { fields: Object.keys(data) }, ip })
    return updated
  }

  /** Remove a biblioteca da aplicação. Os ficheiros no OneDrive/SharePoint não são tocados. */
  async delete(library: s.Library, by: s.User, ip: string | null = null): Promise<void> {
    await this.db.update(s.media).set({ libraryId: null, sourceState: 'out_of_scope', updatedAt: new Date() }).where(eq(s.media.libraryId, library.id))
    await this.db.delete(s.libraryRoots).where(eq(s.libraryRoots.libraryId, library.id))
    await this.db.update(s.libraries).set({ deletedAt: new Date() }).where(eq(s.libraries.id, library.id))
    await audit(this.db, { action: 'library.delete', userId: by.id, subject: { type: 'library', id: library.id }, ip })
  }

  async replaceAccess(library: s.Library, entries: { principal_type: string; principal_id: string; display_name?: string | null; role: string }[], by: s.User, ip: string | null = null) {
    await this.db.delete(s.libraryAccess).where(eq(s.libraryAccess.libraryId, library.id))
    if (entries.length) {
      // Entradas repetidas contam uma só vez (a última ganha).
      const unique = [...new Map(entries.map((e) => [`${e.principal_type}:${e.principal_id}`, e])).values()]
      await this.db.insert(s.libraryAccess).values(unique.map((e) => ({
        libraryId: library.id, principalType: e.principal_type, principalId: e.principal_id, displayName: e.display_name ?? null, role: e.role,
      })))
    }
    await audit(this.db, { action: 'library.access_update', userId: by.id, subject: { type: 'library', id: library.id }, context: { entries: entries.length }, ip })
  }

  private async syncRoots(library: s.Library, roots: NonNullable<LibraryInput['roots']>, authMode: 'app' | 'delegated', by: s.User): Promise<void> {
    const keep: number[] = []
    for (const root of roots) {
      const drive = await this.resolveDrive(root.drive_id, root.site_id ?? null, authMode, by)
      const auth = await this.driveAuth.forSync(drive, by)
      const item = !root.item_id || root.item_id === 'root'
        ? await this.oneDrive.getRoot(drive.driveId, auth)
        : await this.oneDrive.getItem(drive.driveId, root.item_id, auth)
      if (!item.folder && !item.root) throw validationError('roots', translate(this.locale, 'admin.validate.not_folder', { name: item.name ?? '' }))

      const [existing] = await this.db.select().from(s.libraryRoots).where(and(eq(s.libraryRoots.driveId, drive.id), eq(s.libraryRoots.rootItemId, item.id)))
      if (existing && existing.libraryId !== library.id) throw validationError('roots', translate(this.locale, 'admin.root_in_use', { name: item.name ?? '' }))

      const [row] = await this.db.insert(s.libraryRoots).values({ libraryId: library.id, driveId: drive.id, rootItemId: item.id, rootPath: displayPath(item) })
        .onConflictDoUpdate({ target: [s.libraryRoots.driveId, s.libraryRoots.rootItemId], set: { libraryId: library.id, rootPath: displayPath(item), updatedAt: new Date() } })
        .returning()
      keep.push(row.id)
    }
    await this.db.delete(s.libraryRoots).where(and(eq(s.libraryRoots.libraryId, library.id), keep.length ? notInArray(s.libraryRoots.id, keep) : undefined))
  }

  private async resolveDrive(graphDriveId: string, siteId: string | null, authMode: 'app' | 'delegated', by: s.User): Promise<s.Drive> {
    const [existing] = await this.db.select().from(s.drives).where(eq(s.drives.driveId, graphDriveId))
    if (existing) return existing
    const draft = { driveId: graphDriveId, authMode, ownerUserId: authMode === 'delegated' ? by.id : null } as s.Drive
    const info = await this.oneDrive.getDrive(graphDriveId, await this.driveAuth.forSync(draft, by))
    const [drive] = await this.db.insert(s.drives).values({
      driveId: graphDriveId, authMode, ownerUserId: draft.ownerUserId, siteId,
      driveType: info.driveType ?? 'documentLibrary', name: info.name ?? graphDriveId, webUrl: info.webUrl ?? null,
    }).returning()
    return drive
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'biblioteca'
    for (let i = 1; ; i++) {
      const slug = i === 1 ? base : `${base}-${i}`
      const [hit] = await this.db.select({ id: s.libraries.id }).from(s.libraries).where(eq(s.libraries.slug, slug))
      if (!hit) return slug
    }
  }
}

function displayPath(item: Record<string, any>): string {
  if (item.root) return '/'
  const parent = String(item.parentReference?.path ?? '').replace(/^\/drives?\/[^/]+\/root:?/, '')
  return `${parent.replace(/\/+$/, '')}/${item.name}`
}
