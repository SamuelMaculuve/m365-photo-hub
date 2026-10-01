import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { config } from '../config'

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

function key(): Buffer {
  const raw = config.appKey.replace(/^base64:/, '')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('APP_KEY must be 32 bytes in base64 (openssl rand -base64 32)')
  return buf
}

/** Cifra AES-256-GCM: "v1.<iv>.<tag>.<dados>" em base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split('.')
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Invalid encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Token alfanumérico (links de partilha: [A-Za-z0-9]{40}). */
export function randomAlnum(length = 40): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(length * 2)
  let out = ''
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    if (bytes[i] < 248) out += chars[bytes[i] % 62] // evita viés de módulo
  }
  return out.length === length ? out : randomAlnum(length)
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmac(value: string): string {
  return createHmac('sha256', key()).update(value).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** URL relativo assinado e com expiração (equivalente aos URLs assinados do Laravel). */
export function signPath(path: string, ttlSeconds: number, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + ttlSeconds
  const sep = path.includes('?') ? '&' : '?'
  const unsigned = `${path}${sep}expires=${expires}`
  return `${unsigned}&signature=${hmac(unsigned)}`
}

export function verifySignedPath(pathWithQuery: string, now = Date.now()): boolean {
  const url = new URL(pathWithQuery, 'http://local')
  const signature = url.searchParams.get('signature') ?? ''
  const expires = Number(url.searchParams.get('expires'))
  url.searchParams.delete('signature')
  const unsigned = `${url.pathname}${url.search}`
  return Number.isFinite(expires) && expires * 1000 > now && safeEqual(hmac(unsigned), signature)
}

/** Hash de palavra-passe (scrypt) no formato "scrypt$<salt>$<hash>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64)
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, salt, hash] = stored.split('$')
  if (alg !== 'scrypt' || !salt || !hash) return false
  const computed = await scryptAsync(password, Buffer.from(salt, 'base64url'), 64)
  return timingSafeEqual(computed, Buffer.from(hash, 'base64url'))
}
