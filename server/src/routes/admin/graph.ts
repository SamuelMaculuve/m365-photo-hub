import { Hono } from 'hono'
import { z } from 'zod'
import { type AppEnv, requireRole } from '../../lib/context'
import { GraphApiError } from '../../lib/errors'
import { translate } from '../../lib/i18n'
import { parse, queryObject } from '../../lib/validate'
import { GraphAuth } from '../../microsoft/auth'
import { OneDrive, SharePoint } from '../../microsoft/onedrive'

/**
 * Navegador de sites/bibliotecas/pastas para configurar bibliotecas.
 * Usa a identidade da aplicação (a mesma que a sincronização usará), o que também valida o acesso.
 * A pesquisa textual de sites usa o token do administrador; colar o URL do site funciona com Sites.Selected.
 */
export const adminGraphRoutes = new Hono<AppEnv>()
  .get('/graph/sites', async (c) => {
    const user = requireRole(c, 'super_admin')
    const auth = new GraphAuth(c.get('db'))
    const q = parse(z.object({ q: z.string().min(1).max(500) }), queryObject(c.req.url)).q.trim()
    const sp = new SharePoint()
    if (q.startsWith('https://')) return c.json({ data: [await sp.getSiteByUrl(q, auth.forApp())] })
    let sites: Awaited<ReturnType<SharePoint['searchSites']>> = []
    try {
      sites = await sp.searchSites(q, auth.forUser(user))
    } catch (e) {
      if (!(e instanceof GraphApiError && e.isForbidden)) throw e
    }
    return c.json({ data: sites, meta: { hint: translate(c.get('locale'), 'admin.sites_hint') } })
  })
  .get('/graph/sites/:siteId/drives', async (c) => {
    requireRole(c, 'super_admin')
    return c.json({ data: await new SharePoint().siteDrives(c.req.param('siteId'), new GraphAuth(c.get('db')).forApp()) })
  })
  .get('/graph/drives/:driveId/children', async (c) => {
    requireRole(c, 'super_admin')
    const { item_id } = parse(z.object({ item_id: z.string().max(191).optional() }), queryObject(c.req.url))
    return c.json({ data: await new OneDrive().listFolders(c.req.param('driveId'), item_id ?? null, new GraphAuth(c.get('db')).forApp()) })
  })
