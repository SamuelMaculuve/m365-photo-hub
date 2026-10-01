import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import * as s from '../db/schema'
import { GraphApiError } from '../lib/errors'
import { translate, type Locale } from '../lib/i18n'
import { OneDrive } from '../microsoft/onedrive'
import { DriveAuth } from './drive-auth'

/** Valida que a identidade usada pela sincronização consegue ler cada raiz da biblioteca. */
export async function validateLibrary(db: Db, library: s.Library, actingUser: s.User | null, locale: Locale) {
  const t = (key: string, params: Record<string, string | number> = {}) => translate(locale, `admin.validate.${key}`, params)
  const oneDrive = new OneDrive()
  const checks: { key: string; ok: boolean; message: string }[] = []
  const roots = await db.select({ root: s.libraryRoots, drive: s.drives }).from(s.libraryRoots)
    .innerJoin(s.drives, eq(s.drives.id, s.libraryRoots.driveId)).where(eq(s.libraryRoots.libraryId, library.id))

  for (const { root, drive } of roots) {
    if (drive.driveType === 'demo') {
      checks.push({ key: `root:${root.id}`, ok: true, message: t('demo') })
      continue
    }
    const label = drive.name + (root.rootPath ? ` · ${root.rootPath}` : '')
    try {
      const auth = await new DriveAuth(db).forSync(drive, actingUser)
      checks.push({ key: `token:${drive.id}`, ok: true, message: t('token', { mode: drive.authMode }) })
      await oneDrive.getDrive(drive.driveId, auth)
      checks.push({ key: `drive:${drive.id}`, ok: true, message: t('drive', { name: drive.name }) })
      const item = await oneDrive.getItem(drive.driveId, root.rootItemId, auth)
      const isFolder = Boolean(item.folder || item.root)
      checks.push({ key: `folder:${root.id}`, ok: isFolder, message: t(isFolder ? 'folder' : 'not_folder', { name: label }) })
      await oneDrive.latestDeltaLink(drive.driveId, auth)
      checks.push({ key: `delta:${drive.id}`, ok: true, message: t('delta') })
    } catch (e) {
      if (e instanceof GraphApiError) {
        const message = e.isForbidden ? t('forbidden', { name: label })
          : e.isNotFound ? t('not_found', { name: label })
          : e.graphStatus === 401 ? t('unauthorised')
          : t('graph_error', { name: label, code: e.graphCode ?? String(e.graphStatus) })
        checks.push({ key: `error:${root.id}`, ok: false, message })
      } else {
        console.error(e)
        checks.push({ key: `error:${root.id}`, ok: false, message: t('unexpected', { name: label }) })
      }
    }
  }
  if (!checks.length) checks.push({ key: 'roots', ok: false, message: t('no_roots') })
  return { ok: checks.every((c) => c.ok), checks }
}
