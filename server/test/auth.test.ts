import { eq } from 'drizzle-orm'
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import * as s from '../src/db/schema'
import { testDb } from './setup'
import { Client, fake, json, makeLibrary, makeMedia, makeUser, sent } from './helpers'

let privateKey: CryptoKey
let jwk: JWK

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true })
  privateKey = pair.privateKey
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', use: 'sig' }
})

function idToken(claims: Record<string, unknown>) {
  return new SignJWT({
    aud: 'client-test', iss: 'https://login.microsoftonline.com/tenant-test/v2.0', tid: 'tenant-test', oid: 'oid-123',
    name: 'Samuel Teste', preferred_username: 'samuel@org.mz', ...claims,
  }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuedAt().setNotBefore('0s').setExpirationTime('1h').sign(privateKey)
}

async function startLogin(client: Client) {
  const res = await client.get('/auth/microsoft/redirect')
  expect(res.status).toBe(302)
  return Object.fromEntries(new URL(res.headers.get('location')!).searchParams)
}

function fakeMicrosoft(query: Record<string, string>, claims: Record<string, unknown>) {
  fake('/discovery/v2.0/keys', () => json({ keys: [jwk] }))
  fake('/oauth2/v2.0/token', async (req) => {
    if (req.form.get('grant_type') !== 'authorization_code') return json({ access_token: 'app-token', expires_in: 3600 })
    return json({ access_token: 'user-access-token', refresh_token: 'user-refresh-token', expires_in: 3600, id_token: await idToken({ nonce: query.nonce, ...claims }) })
  })
}

describe('auth', () => {
  it('redirect uses PKCE, state and least-privilege scopes', async () => {
    const q = await startLogin(new Client())
    expect(q.client_id).toBe('client-test')
    expect(q.code_challenge_method).toBe('S256')
    expect(q.state).toBeTruthy()
    expect(q.scope).toContain('offline_access')
    expect(q.scope).toContain('Files.Read.All')
    expect(q.scope).not.toContain('ReadWrite')
  })

  it('successful login creates user with Entra role and encrypted tokens', async () => {
    const client = new Client()
    const q = await startLogin(client)
    fakeMicrosoft(q, { roles: ['Photos.Editor'], groups: ['group-a'] })

    const res = await client.get(`/auth/microsoft/callback?code=abc&state=${q.state}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/')

    const [user] = await testDb().select().from(s.users).where(eq(s.users.entraOid, 'oid-123'))
    expect(user.role).toBe('editor')
    expect(user.groupIds).toEqual(['group-a'])
    const me = await (await client.get('/api/users/me')).json()
    expect(me.data.id).toBe(user.id)

    const [token] = await testDb().select().from(s.oauthTokens)
    expect(token.refreshToken).not.toContain('user-refresh-token')
    const [log] = await testDb().select().from(s.auditLogs).where(eq(s.auditLogs.action, 'auth.login'))
    expect(log).toMatchObject({ result: 'success', userId: user.id })
  })

  it('rejects an invalid state', async () => {
    const client = new Client()
    await startLogin(client)
    const res = await client.get('/auth/microsoft/callback?code=abc&state=wrong')
    expect(res.headers.get('location')).toBe('/login?error=invalid_state')
    expect((await client.get('/api/users/me')).status).toBe(401)
  })

  it('rejects a token from another tenant', async () => {
    const client = new Client()
    const q = await startLogin(client)
    fakeMicrosoft(q, { tid: 'other-tenant', iss: 'https://login.microsoftonline.com/other-tenant/v2.0' })
    const res = await client.get(`/auth/microsoft/callback?code=abc&state=${q.state}`)
    expect(res.headers.get('location')).toBe('/login?error=invalid_tenant')
    expect(await testDb().select().from(s.users)).toHaveLength(0)
  })

  it('bootstraps super admin by email', async () => {
    process.env.MICROSOFT_BOOTSTRAP_SUPER_ADMINS = 'samuel@org.mz'
    try {
      const client = new Client()
      const q = await startLogin(client)
      fakeMicrosoft(q, {})
      await client.get(`/auth/microsoft/callback?code=abc&state=${q.state}`)
      const [user] = await testDb().select().from(s.users)
      expect(user.role).toBe('super_admin')
    } finally {
      process.env.MICROSOFT_BOOTSTRAP_SUPER_ADMINS = ''
    }
  })

  it('disabled user cannot sign in', async () => {
    await makeUser({ entraOid: 'oid-123', isActive: false })
    const client = new Client()
    const q = await startLogin(client)
    fakeMicrosoft(q, {})
    const res = await client.get(`/auth/microsoft/callback?code=abc&state=${q.state}`)
    expect(res.headers.get('location')).toBe('/login?error=account_disabled')
  })

  it('API requires authentication with a friendly error', async () => {
    const res = await new Client().get('/api/users/me')
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
  })

  it('mutating requests require the XSRF token', async () => {
    const client = await new Client().actingAs(await makeUser())
    const res = await client.request('PATCH', '/api/users/me', { json: { locale: 'en' }, headers: { 'x-xsrf-token': 'wrong' } })
    expect(res.status).toBe(419)
    expect((await client.patch('/api/users/me', { locale: 'en' })).status).toBe(200)
  })

  it('expired refresh token forces a new login', async () => {
    const { library, drive } = await makeLibrary({ visibility: 'organisation' })
    await testDb().update(s.drives).set({ authMode: 'delegated' }).where(eq(s.drives.id, drive.id))
    const m = await makeMedia(library, drive)
    const user = await makeUser()
    const { encrypt } = await import('../src/lib/crypto')
    await testDb().insert(s.oauthTokens).values({ userId: user.id, accessToken: encrypt('old'), refreshToken: encrypt('dead'), expiresAt: new Date(Date.now() - 3600_000) })
    fake('/oauth2/v2.0/token', () => json({ error: 'invalid_grant' }, 400))

    const client = await new Client().actingAs(user)
    const res = await client.get(`/api/photos/${m.id}/thumbnail/medium`)
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe('unauthenticated')
    expect(await testDb().select().from(s.oauthTokens)).toHaveLength(0)
  })

  it('dev login is unavailable outside local', async () => {
    process.env.AUTH_DEV_LOGIN = 'true'
    try {
      expect((await new Client().post('/auth/dev-login', { email: 'a@b.mz' })).status).toBe(404)
    } finally {
      process.env.AUTH_DEV_LOGIN = 'false'
    }
  })

  it('never returns Microsoft tokens from the API', async () => {
    const user = await makeUser()
    const { encrypt } = await import('../src/lib/crypto')
    await testDb().insert(s.oauthTokens).values({ userId: user.id, accessToken: encrypt('SECRET-ACCESS'), refreshToken: encrypt('SECRET-REFRESH'), expiresAt: new Date(Date.now() + 3600_000) })
    const body = await (await (await new Client().actingAs(user)).get('/api/users/me')).text()
    expect(body).not.toContain('SECRET')
    expect(sent.length).toBe(0)
  })
})
