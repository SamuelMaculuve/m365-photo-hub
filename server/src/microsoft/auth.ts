import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose'
import { config } from '../config'
import type { Db } from '../db/client'
import { oauthTokens } from '../db/schema'
import { Cache } from '../lib/cache'
import type { User } from '../lib/context'
import { decrypt, encrypt, safeEqual } from '../lib/crypto'
import { GraphApiError, unauthenticated } from '../lib/errors'

/** Fornece um access token para uma identidade (aplicação ou utilizador). */
export interface GraphTokenProvider {
  token(): Promise<string>
  /** Descarta o token em cache (ex.: após um 401) para que o próximo pedido o renove. */
  invalidate(): void
  /** Identidade estável, usada em chaves de cache que dependem de quem pede. */
  identity(): string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  id_token?: string
  expires_in?: number
  scope?: string
}

const APP_TOKEN_KEY = 'graph:app_token'
const JWKS_KEY = 'graph:jwks'

export const codeChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
export const newCodeVerifier = () => randomBytes(48).toString('base64url')

/**
 * OpenID Connect / OAuth 2.0 com o Microsoft identity platform:
 * - Authorization Code Flow + PKCE para utilizadores (delegado);
 * - Client credentials para a identidade da aplicação (sincronização, links públicos).
 */
export class GraphAuth {
  private readonly cache: Cache

  constructor(private readonly db: Db) {
    this.cache = new Cache(db)
  }

  isConfigured(): boolean {
    const m = config.microsoft
    return Boolean(m.tenantId && m.clientId && m.clientSecret && m.redirectUri)
  }

  authorizationUrl(state: string, nonce: string, verifier: string): string {
    const q = new URLSearchParams({
      client_id: config.microsoft.clientId,
      response_type: 'code',
      redirect_uri: config.microsoft.redirectUri,
      response_mode: 'query',
      scope: config.microsoft.delegatedScopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    })
    return `${this.endpoint('authorize')}?${q.toString().replace(/\+/g, '%20')}`
  }

  exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.microsoft.redirectUri,
      code_verifier: verifier,
      scope: config.microsoft.delegatedScopes.join(' '),
    })
  }

  /** Valida o id_token: assinatura (JWKS do tenant), emissor, audiência, tenant, nonce e validade. */
  async validateIdToken(idToken: string, expectedNonce: string): Promise<JWTPayload & Record<string, unknown>> {
    const tenant = config.microsoft.tenantId
    let payload: JWTPayload
    try {
      payload = (await jwtVerify(idToken, createLocalJWKSet(await this.jwks()), { algorithms: ['RS256'] })).payload
    } catch {
      // As chaves podem ter rodado: renovar o JWKS uma vez.
      await this.cache.forget(JWKS_KEY)
      try {
        payload = (await jwtVerify(idToken, createLocalJWKSet(await this.jwks()), { algorithms: ['RS256'] })).payload
      } catch (e) {
        throw unauthenticated('Invalid id_token signature', { cause: String(e) })
      }
    }

    const checks: Record<string, boolean> = {
      aud: payload.aud === config.microsoft.clientId,
      tid: payload.tid === tenant,
      iss: payload.iss === `${config.microsoft.authority}/${tenant}/v2.0`,
      nonce: safeEqual(expectedNonce, String(payload.nonce ?? '')),
      oid: Boolean(payload.oid),
    }
    for (const [claim, ok] of Object.entries(checks)) {
      if (!ok) throw unauthenticated(`id_token claim check failed: ${claim}`, { claim })
    }
    return payload as JWTPayload & Record<string, unknown>
  }

  async storeUserTokens(user: User, tokens: TokenResponse): Promise<void> {
    const [existing] = await this.db.select().from(oauthTokens).where(eq(oauthTokens.userId, user.id))
    const values = {
      accessToken: encrypt(tokens.access_token),
      // A Microsoft pode não devolver um novo refresh token; nesse caso mantém-se o anterior.
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : (existing?.refreshToken ?? null),
      scopes: tokens.scope ?? null,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      updatedAt: new Date(),
    }
    await this.db.insert(oauthTokens).values({ userId: user.id, provider: 'microsoft', ...values })
      .onConflictDoUpdate({ target: [oauthTokens.userId, oauthTokens.provider], set: values })
  }

  /** Access token delegado válido, renovado automaticamente (com lock para evitar renovações concorrentes). */
  async userAccessToken(user: User, forceRefresh = false): Promise<string> {
    const load = async () => (await this.db.select().from(oauthTokens).where(eq(oauthTokens.userId, user.id)))[0]
    const expiresSoon = (t: { expiresAt: Date | null }) => !t.expiresAt || t.expiresAt.getTime() - 300_000 < Date.now()

    const token = await load()
    if (!token) throw unauthenticated('No Microsoft token for user')
    if (!forceRefresh && !expiresSoon(token)) return decrypt(token.accessToken)

    return this.cache.withLock(`graph:refresh:${user.id}`, 30, 20_000, async () => {
      const fresh = await load()
      if (!fresh) throw unauthenticated('No Microsoft token for user')
      if (!forceRefresh && !expiresSoon(fresh)) return decrypt(fresh.accessToken) // outro processo já renovou
      if (!fresh.refreshToken) throw unauthenticated('No refresh token')

      let tokens: TokenResponse
      try {
        tokens = await this.tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: decrypt(fresh.refreshToken),
          scope: config.microsoft.delegatedScopes.join(' '),
        })
      } catch (e) {
        if (e instanceof GraphApiError && ['invalid_grant', 'interaction_required'].includes(e.graphCode ?? '')) {
          await this.db.delete(oauthTokens).where(eq(oauthTokens.id, fresh.id))
          throw unauthenticated('Refresh token revoked or expired')
        }
        throw e
      }
      await this.storeUserTokens(user, tokens)
      return tokens.access_token
    })
  }

  async appAccessToken(): Promise<string> {
    const cached = await this.cache.get<string>(APP_TOKEN_KEY)
    if (cached) return decrypt(cached)
    const tokens = await this.tokenRequest({ grant_type: 'client_credentials', scope: config.microsoft.appScope })
    const ttl = Math.max(60, (tokens.expires_in ?? 3600) - 300)
    await this.cache.put(APP_TOKEN_KEY, encrypt(tokens.access_token), ttl)
    return tokens.access_token
  }

  forgetAppToken(): Promise<void> {
    return this.cache.forget(APP_TOKEN_KEY)
  }

  forApp(): GraphTokenProvider {
    return {
      token: () => this.appAccessToken(),
      invalidate: () => void this.forgetAppToken(),
      identity: () => 'app',
    }
  }

  forUser(user: User): GraphTokenProvider {
    let force = false
    return {
      token: async () => {
        const t = await this.userAccessToken(user, force)
        force = false
        return t
      },
      invalidate: () => { force = true },
      identity: () => `user:${user.id}`,
    }
  }

  logoutUrl(postLogoutRedirect: string): string {
    return `${this.endpoint('logout')}?${new URLSearchParams({ post_logout_redirect_uri: postLogoutRedirect })}`
  }

  private async tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
    const body = new URLSearchParams({ ...params, client_id: config.microsoft.clientId, client_secret: config.microsoft.clientSecret })
    let res: Response
    try {
      res = await fetch(this.endpoint('token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      throw new GraphApiError('Token request failed (network)', 0, null, { cause: String(e) })
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || typeof json.access_token !== 'string') {
      const code = typeof json.error === 'string' ? json.error : null
      // error_description pode conter IDs de correlação úteis; nunca contém segredos.
      console.warn('Token request failed', { grant_type: params.grant_type, status: res.status, error: code, description: String(json.error_description ?? '').slice(0, 300) })
      throw new GraphApiError('Token request failed', res.status, code)
    }
    return json as unknown as TokenResponse
  }

  private jwks(): Promise<JSONWebKeySet> {
    return this.cache.remember(JWKS_KEY, 12 * 3600, async () => {
      const res = await fetch(`${config.microsoft.authority}/${config.microsoft.tenantId}/discovery/v2.0/keys`, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) throw new GraphApiError('Could not fetch JWKS', res.status)
      return (await res.json()) as JSONWebKeySet
    })
  }

  private endpoint(name: string): string {
    return `${config.microsoft.authority}/${config.microsoft.tenantId}/oauth2/v2.0/${name}`
  }
}
