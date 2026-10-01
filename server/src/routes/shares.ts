import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config'
import * as s from '../db/schema'
import { audit } from '../lib/audit'
import { Cache } from '../lib/cache'
import { type AppContext, type AppEnv, hasRole, requireUser } from '../lib/context'
import { signPath, verifySignedPath } from '../lib/crypto'
import { iso } from '../lib/dates'
import { AppError, forbidden, notFound, shareExpired, unauthenticated } from '../lib/errors'
import { parse } from '../lib/validate'
import { MediaContent } from '../services/content'
import { mediaResource, SIZES } from '../services/media-resource'
import { isActiveShare, ShareService } from '../services/shares'
import { Timeline } from '../services/timeline'

const SIGNED_TTL = 120 * 60

const shareSchema = z.object({
  type: z.enum(['album', 'media']),
  album_id: z.number().int().nullish(),
  media_ids: z.array(z.number().int()).max(500).optional(),
  audience: z.enum(['organisation', 'users', 'public']),
  user_ids: z.array(z.number().int()).max(200).optional(),
  expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  password: z.string().min(6).max(100).nullish(),
}).superRefine((d, ctx) => {
  if (d.type === 'album' && !d.album_id) ctx.addIssue({ code: 'invalid_type', expected: 'number', input: undefined, path: ['album_id'] })
  if (d.type === 'media' && !d.media_ids?.length) ctx.addIssue({ code: 'invalid_type', expected: 'array', input: undefined, path: ['media_ids'] })
  if (d.audience === 'users' && !d.user_ids?.length) ctx.addIssue({ code: 'invalid_type', expected: 'array', input: undefined, path: ['user_ids'] })
  if (d.expires_at && d.expires_at < new Date().toISOString().slice(0, 10)) ctx.addIssue({ code: 'custom', message: 'A data de expiração não pode estar no passado.', path: ['expires_at'] })
})

/**
 * Depois de validado (incl. palavra-passe), os URLs das imagens são assinados e expiram —
 * as tags <img> não conseguem enviar cabeçalhos.
 */
async function payload(c: AppContext, svc: ShareService, share: s.Share, viewer: s.User | null) {
  await svc.recordAccess(share)
  let items: (s.Media & { isFavourite?: boolean })[] = await svc.items(share)
  if (viewer) items = await new Timeline(c.get('db')).withFavourites(items, viewer)
  const url = (m: s.Media, kind: string, size?: string) => kind === 'thumbnail'
    ? signPath(`/api/public/share-content/${share.id}/${m.id}/thumbnail/${size}`, SIGNED_TTL)
    : signPath(`/api/public/share-content/${share.id}/${m.id}/download`, SIGNED_TTL)
  const [creator] = await c.get('db').select({ name: s.users.name }).from(s.users).where(eq(s.users.id, share.createdBy))
  c.header('Cache-Control', 'no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  return c.json({ data: {
    id: share.id,
    title: await svc.title(share),
    type: share.shareableType,
    audience: share.audience,
    expires_at: iso(share.expiresAt),
    created_by: share.audience === 'public' ? null : (creator?.name ?? null),
    items: items.map((m) => mediaResource(m, url)),
  } })
}

/**
 * A assinatura prova que as verificações (token, palavra-passe, destinatário) foram feitas
 * quando o URL foi emitido; revogação/expiração continuam a ser verificadas a cada pedido.
 */
async function resolveSigned(c: AppContext, svc: ShareService) {
  const url = new URL(c.req.url)
  if (!verifySignedPath(`${url.pathname}${url.search}`)) throw forbidden('Invalid signature')
  const [share] = await c.get('db').select().from(s.shares).where(eq(s.shares.id, Number(c.req.param('share'))))
  if (!share) throw notFound()
  if (!isActiveShare(share)) throw shareExpired()
  // Partilhas internas exigem sessão também para o conteúdo.
  if (share.audience !== 'public' && !c.get('user')) throw unauthenticated()
  return { share, item: await svc.findMedia(share, Number(c.req.param('media'))) }
}

/** Partilhas públicas usam a identidade da aplicação; internas usam o utilizador autenticado. */
const contentViewer = (c: AppContext, share: s.Share) => (share.audience === 'public' ? null : c.get('user'))

async function throttle(c: AppContext, key: string, limit: number) {
  const r = await new Cache(c.get('db')).hit(key, limit, 60)
  if (!r.ok) throw new AppError('too_many_requests', 429, 'Rate limited', {}, { 'Retry-After': String(r.retryAfter) })
}

export const shareRoutes = new Hono<AppEnv>()
  .get('/shares', async (c) => {
    const user = requireUser(c)
    const svc = new ShareService(c.get('db'), c.get('locale'))
    return c.json({ data: await svc.resources(await svc.mine(user), { recipients: true }) })
  })
  .get('/shared-with-me', async (c) => {
    const user = requireUser(c)
    const svc = new ShareService(c.get('db'), c.get('locale'))
    // Estas partilhas não expõem o token; a abertura faz-se por /api/shares/{id}/items.
    return c.json({ data: await svc.resources(await svc.sharedWith(user), { creator: true }) })
  })
  .post('/shares', async (c) => {
    const user = requireUser(c)
    await throttle(c, `shares:${user.id}`, 30)
    const db = c.get('db')
    const data = parse(shareSchema, await c.req.json().catch(() => ({})))
    const svc = new ShareService(db, c.get('locale'))
    const { share, token } = await svc.create(user, data)
    await audit(db, { action: 'share.create', userId: user.id, subject: { type: 'share', id: share.id }, context: { audience: data.audience, type: data.type }, ip: c.get('ip') })
    const [resource] = await svc.resources([share], { recipients: true })
    return c.json({ data: { ...resource, token, url: `${config.appUrl}/s/${token}` } }, 201)
  })
  .delete('/shares/:id{[0-9]+}', async (c) => {
    const user = requireUser(c)
    const db = c.get('db')
    const [share] = await db.select().from(s.shares).where(eq(s.shares.id, Number(c.req.param('id'))))
    if (!share || (share.createdBy !== user.id && !hasRole(user, 'photo_admin'))) throw notFound()
    await db.update(s.shares).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(s.shares.id, share.id))
    await audit(db, { action: 'share.revoke', userId: user.id, subject: { type: 'share', id: share.id }, ip: c.get('ip') })
    return c.json({ data: { revoked: true } })
  })
  /** Destinatários de partilhas internas abrem-nas pelo id (não conhecem o token). */
  .get('/shares/:id{[0-9]+}/items', async (c) => {
    const user = requireUser(c)
    const svc = new ShareService(c.get('db'), c.get('locale'))
    const [share] = await c.get('db').select().from(s.shares).where(eq(s.shares.id, Number(c.req.param('id'))))
    if (!share || share.audience === 'public' || (share.createdBy !== user.id && !(await svc.isRecipient(share, user)))) throw notFound()
    if (!isActiveShare(share)) throw shareExpired()
    return payload(c, svc, share, user)
  })
  .get('/public/shares/:token{[A-Za-z0-9]{40}}', async (c) => {
    const token = c.req.param('token')
    // Inclui tentativas de palavra-passe: limitado por IP e por link.
    await throttle(c, `public:${c.get('ip')}`, 60)
    await throttle(c, `share:${c.get('ip')}:${token}`, 15)
    const svc = new ShareService(c.get('db'), c.get('locale'))
    const viewer = c.get('user')
    return payload(c, svc, await svc.resolve(token, viewer, c.req.header('x-share-password') ?? null), viewer)
  })
  .get('/public/share-content/:share{[0-9]+}/:media{[0-9]+}/thumbnail/:size', async (c) => {
    if (!(SIZES as readonly string[]).includes(c.req.param('size'))) throw notFound()
    const { share, item } = await resolveSigned(c, new ShareService(c.get('db')))
    const thumb = await new MediaContent(c.get('db')).thumbnail(item, c.req.param('size'), contentViewer(c, share))
    return c.body(thumb.data, 200, { 'Content-Type': thumb.mime, 'Cache-Control': 'private, max-age=3600', 'X-Robots-Tag': 'noindex' })
  })
  .get('/public/share-content/:share{[0-9]+}/:media{[0-9]+}/download', async (c) => {
    const { share, item } = await resolveSigned(c, new ShareService(c.get('db')))
    const url = await new MediaContent(c.get('db')).downloadUrl(item, contentViewer(c, share))
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return c.redirect(url, 302)
  })
