import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { describe, expect, it } from 'vitest'
import { ApiError, cleanParams, normaliseError } from './api'

function axiosError(status: number, data: unknown, headers: Record<string, string> = {}): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response = { status, data, headers, statusText: '', config } as unknown as AxiosResponse
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, {}, response)
}

describe('normaliseError', () => {
  it('reads the {error:{code,message,errors}} envelope', () => {
    const err = normaliseError(
      axiosError(422, { error: { code: 'validation_error', message: 'Dados inválidos', errors: { name: ['Obrigatório'] } } }),
    )
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation_error')
    expect(err.message).toBe('Dados inválidos')
    expect(err.fieldError('name')).toBe('Obrigatório')
    expect(err.isClientError).toBe(true)
  })

  it('falls back to a code derived from the HTTP status', () => {
    expect(normaliseError(axiosError(502, {})).code).toBe('media_unavailable')
    expect(normaliseError(axiosError(423, null)).code).toBe('share_password_required')
    expect(normaliseError(axiosError(401, 'html')).code).toBe('unauthenticated')
    expect(normaliseError(axiosError(500, {})).code).toBe('server_error')
  })

  it('parses Retry-After on 503', () => {
    const err = normaliseError(axiosError(503, { error: { code: 'graph_throttled', message: 'x' } }, { 'retry-after': '7' }))
    expect(err.code).toBe('graph_throttled')
    expect(err.retryAfter).toBe(7)
  })

  it('maps missing responses to network_error', () => {
    const e = new AxiosError('Network Error', 'ERR_NETWORK')
    const err = normaliseError(e)
    expect(err.status).toBe(0)
    expect(err.code).toBe('network_error')
  })

  it('passes ApiError through and wraps generic errors', () => {
    const original = new ApiError({ status: 404, code: 'not_found', message: 'x' })
    expect(normaliseError(original)).toBe(original)
    expect(normaliseError(new Error('boom')).code).toBe('unknown')
  })
})

describe('cleanParams', () => {
  it('drops empty values and converts true to 1', () => {
    expect(cleanParams({ a: undefined, b: null, c: '', d: false, e: true, f: 0, g: 'x' })).toEqual({ e: 1, f: 0, g: 'x' })
  })
})
