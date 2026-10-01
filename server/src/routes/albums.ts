import { Hono } from 'hono'
import { z } from 'zod'
import { type AppContext, type AppEnv, requireUser } from '../lib/context'
import { intish, parse, queryObject } from '../lib/validate'
import { AlbumService } from '../services/albums'
import { Timeline } from '../services/timeline'
import { mediaFilterRequest } from './filters'
import { cursorResponse } from './photos'

const albumSchema = (creating: boolean) => z.object({
  name: creating ? z.string().min(1).max(150) : z.string().min(1).max(150).optional(),
  description: z.string().max(2000).nullish(),
  visibility: z.enum(['private', 'organisation']).optional(),
  cover_media_id: z.number().int().nullish(),
})
const idsSchema = z.object({ media_ids: z.array(z.number().int()).min(1).max(1000) })

const service = (c: AppContext) => new AlbumService(c.get('db'), undefined, c.get('ip'))
const one = async (c: AppContext, svc: AlbumService, album: Parameters<AlbumService['resources']>[0][number]) =>
  (await svc.resources([album], requireUser(c)))[0]

export const albumRoutes = new Hono<AppEnv>()
  .get('/albums', async (c) => {
    const user = requireUser(c)
    const { q, page } = parse(z.object({ q: z.string().max(100).optional(), page: intish.min(1).optional() }), queryObject(c.req.url))
    return c.json(await service(c).list(user, q || null, page ?? 1))
  })
  .post('/albums', async (c) => {
    const user = requireUser(c)
    const svc = service(c)
    const album = await svc.create(user, parse(albumSchema(true), await c.req.json().catch(() => ({}))) as { name: string })
    return c.json({ data: await one(c, svc, album) }, 201)
  })
  .get('/albums/:id{[0-9]+}', async (c) => {
    const svc = service(c)
    return c.json({ data: await one(c, svc, await svc.find(c.req.param('id'), requireUser(c))) })
  })
  .put('/albums/:id{[0-9]+}', async (c) => {
    const user = requireUser(c)
    const svc = service(c)
    const album = await svc.find(c.req.param('id'), user, 'update')
    const updated = await svc.update(album, user, parse(albumSchema(false), await c.req.json().catch(() => ({}))))
    return c.json({ data: await one(c, svc, updated) })
  })
  .delete('/albums/:id{[0-9]+}', async (c) => {
    const user = requireUser(c)
    const svc = service(c)
    await svc.delete(await svc.find(c.req.param('id'), user, 'update'), user)
    return c.json({ data: { deleted: true } })
  })
  .get('/albums/:id{[0-9]+}/media', async (c) => {
    const user = requireUser(c)
    const album = await service(c).find(c.req.param('id'), user)
    const timeline = new Timeline(c.get('db'))
    const { filters, cursor, limit } = mediaFilterRequest(c.req.url)
    return cursorResponse(c, await timeline.paginate(user, await timeline.conditions(user, { ...filters, album_id: album.id }), limit, cursor), limit)
  })
  .post('/albums/:id{[0-9]+}/media', async (c) => {
    const user = requireUser(c)
    const svc = service(c)
    const album = await svc.find(c.req.param('id'), user, 'add')
    const { media_ids } = parse(idsSchema, await c.req.json().catch(() => ({})))
    return c.json({ data: { added: await svc.addMedia(album, user, media_ids) } })
  })
  .delete('/albums/:id{[0-9]+}/media', async (c) => {
    const user = requireUser(c)
    const svc = service(c)
    const album = await svc.find(c.req.param('id'), user, 'add')
    const { media_ids } = parse(idsSchema, await c.req.json().catch(() => ({})))
    return c.json({ data: { removed: await svc.removeMedia(album, user, media_ids) } })
  })
