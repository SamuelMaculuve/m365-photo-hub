import { and, count, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from '../config'
import type { Db } from '../db/client'
import { users } from '../db/schema'
import { audit } from '../lib/audit'
import type { AppContext, AppEnv, User } from '../lib/context'
import { decrypt, encrypt, randomToken, safeEqual } from '../lib/crypto'
import { AppError, notFound } from '../lib/errors'
import { fromEntraAppRole, maxRole, type Role } from '../lib/roles'
import { endSession, issueCsrfCookie, startSession } from '../lib/session'
import { parse } from '../lib/validate'
import { GraphAuth, newCodeVerifier } from '../microsoft/auth'
import { GraphClient } from '../microsoft/graph'

const OAUTH_COOKIE = 'm365_oauth'

const devLoginEnabled = () => config.isLocal && config.devLogin

/** Login com Microsoft Entra ID (Authorization Code + PKCE), executado inteiramente no servidor. */
export const authRoutes = new Hono<AppEnv>()
  .get('/sanctum/csrf-cookie', (c) => {
    issueCsrfCookie(c)
    return c.body(null, 204)
  })
  .get('/api/auth/config', (c) =>
    c.json({ data: { app_name: config.appName, microsoft_configured: new GraphAuth(c.get('db')).isConfigured(), dev_login: devLoginEnabled() } }),
  )
  .get('/auth/microsoft/redirect', (c) => {
    const auth = new GraphAuth(c.get('db'))
    if (!auth.isConfigured()) return fail(c, 'login_failed')
    const state = randomToken(30)
    const nonce = randomToken(30)
    const verifier = newCodeVerifier()
    // Estado do fluxo num cookie cifrado de curta duração (não há sessão do lado do servidor ainda).
    setCookie(c, OAUTH_COOKIE, encrypt(JSON.stringify({ state, nonce, verifier, at: Date.now() })), {
      httpOnly: true, secure: !config.isLocal, sameSite: 'Lax', path: '/auth', maxAge: 600,
    })
    return c.redirect(auth.authorizationUrl(state, nonce, verifier), 302)
  })
  .get('/auth/microsoft/callback', async (c) => {
    const db = c.get('db')
    const auth = new GraphAuth(db)
    const raw = getCookie(c, OAUTH_COOKIE)
    deleteCookie(c, OAUTH_COOKIE, { path: '/auth' })
    const ip = c.get('ip')

    const error = c.req.query('error')
    if (error) {
      await audit(db, { action: 'auth.login', result: 'denied', context: { reason: error }, ip })
      return fail(c, error === 'access_denied' ? 'access_denied' : 'login_failed')
    }

    let oauth: { state: string; nonce: string; verifier: string; at: number } | null = null
    try {
      oauth = raw ? JSON.parse(decrypt(raw)) : null
    } catch {
      oauth = null
    }
    const state = c.req.query('state') ?? ''
    const code = c.req.query('code')
    if (!oauth || !safeEqual(oauth.state, state) || Date.now() - oauth.at > 600_000 || !code) {
      await audit(db, { action: 'auth.login', result: 'denied', context: { reason: 'invalid_state' }, ip })
      return fail(c, 'invalid_state')
    }

    let tokens, claims
    try {
      tokens = await auth.exchangeCode(code, oauth.verifier)
      claims = await auth.validateIdToken(tokens.id_token ?? '', oauth.nonce)
    } catch (e) {
      console.error('login failed', e)
      const reason = e instanceof AppError && e.message.includes('tid') ? 'invalid_tenant' : 'login_failed'
      await audit(db, { action: 'auth.login', result: 'denied', context: { reason }, ip })
      return fail(c, reason)
    }

    let user = await upsertUser(db, claims)
    if (!user.isActive) {
      await audit(db, { action: 'auth.login', userId: user.id, subject: { type: 'user', id: user.id }, result: 'denied', context: { reason: 'account_disabled' }, ip })
      return fail(c, 'account_disabled')
    }

    await auth.storeUserTokens(user, tokens)

    // Overage: o id_token não traz os grupos (utilizador em demasiados grupos) — pedir ao Graph.
    const claimNames = claims._claim_names as Record<string, unknown> | undefined
    if (claimNames && 'groups' in claimNames) {
      try {
        const ids: string[] = []
        for await (const g of new GraphClient().paginate('/me/transitiveMemberOf/microsoft.graph.group', auth.forUser(user), { $select: 'id', $top: 999 })) ids.push(g.id)
        ;[user] = await db.update(users).set({ groupIds: ids, groupsSyncedAt: new Date() }).where(eq(users.id, user.id)).returning()
      } catch (e) {
        console.error('group overage lookup failed', e)
      }
    }

    await startSession(c, user.id)
    await audit(db, { action: 'auth.login', userId: user.id, subject: { type: 'user', id: user.id }, ip })
    return c.redirect(config.frontendUrl, 302)
  })
  .post('/auth/logout', async (c) => {
    const user = c.get('user')
    const db = c.get('db')
    if (user) await audit(db, { action: 'auth.logout', userId: user.id, subject: { type: 'user', id: user.id }, ip: c.get('ip') })
    await endSession(c)
    const auth = new GraphAuth(db)
    return c.json({ data: { logout_url: user?.entraOid && auth.isConfigured() ? auth.logoutUrl(`${config.appUrl}/login`) : config.frontendUrl } })
  })
  /** Login de desenvolvimento (sem Microsoft). Só existe localmente com AUTH_DEV_LOGIN=true. */
  .post('/auth/dev-login', async (c) => {
    if (!devLoginEnabled()) throw notFound()
    const db = c.get('db')
    const { email } = parse(z.object({ email: z.email().max(190) }), await c.req.json().catch(() => ({})))
    const address = email.toLowerCase()
    let [user] = await db.select().from(users).where(and(eq(users.email, address), isNull(users.deletedAt)))
    if (!user) {
      const [{ n }] = await db.select({ n: count() }).from(users)
      const name = address.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
      ;[user] = await db.insert(users).values({ email: address, name, role: n === 0 ? 'super_admin' : 'viewer', roleSource: 'local', locale: 'pt' }).returning()
    }
    await startSession(c, user.id)
    await audit(db, { action: 'auth.dev_login', userId: user.id, subject: { type: 'user', id: user.id }, ip: c.get('ip') })
    return c.json({ data: { ok: true } })
  })

async function upsertUser(db: Db, claims: Record<string, unknown>): Promise<User> {
  const email = String(claims.email ?? claims.preferred_username ?? '').toLowerCase()
  const upn = String(claims.preferred_username ?? '').toLowerCase()
  const [existing] = await db.select().from(users).where(eq(users.entraOid, String(claims.oid)))

  const values: Partial<typeof users.$inferInsert> = {
    tenantId: String(claims.tid),
    name: String(claims.name ?? email),
    email: email || null,
    upn: upn || null,
    lastLoginAt: new Date(),
    deletedAt: null,
    updatedAt: new Date(),
  }
  if (Array.isArray(claims.groups)) {
    values.groupIds = claims.groups.map(String)
    values.groupsSyncedAt = new Date()
  }

  // Papéis globais vêm das App Roles do Entra ID, excepto se um administrador os fixou localmente.
  let role = (existing?.role ?? 'viewer') as Role
  if (existing?.roleSource !== 'local') {
    const roles = (Array.isArray(claims.roles) ? claims.roles : []).map((r) => fromEntraAppRole(String(r))).filter((r): r is Role => r !== null)
    role = roles.length ? maxRole(...roles) : 'viewer'
    values.roleSource = 'entra'
  }
  const bootstrap = config.microsoft.bootstrapSuperAdmins
  if ((email && bootstrap.includes(email)) || (upn && bootstrap.includes(upn))) role = 'super_admin'
  values.role = role

  if (existing) {
    const [u] = await db.update(users).set(values).where(eq(users.id, existing.id)).returning()
    return u
  }
  const [u] = await db.insert(users).values({ ...values, entraOid: String(claims.oid), name: values.name!, locale: 'pt' }).returning()
  return u
}

function fail(c: AppContext, code: string) {
  return c.redirect(`/login?error=${code}`, 302)
}
