import { describe, expect, it } from 'vitest'
import { ApiError } from '@/services/api'
import { retryDelay, shouldRetry } from './queryClient'

const err = (status: number, retryAfter: number | null = null) => new ApiError({ status, code: 'x', message: '', retryAfter })

describe('retry policy', () => {
  it('never retries 4xx', () => {
    for (const s of [400, 401, 403, 404, 410, 422, 423]) expect(shouldRetry(0, err(s))).toBe(false)
  })
  it('retries 503 and 429 with a limit', () => {
    expect(shouldRetry(0, err(503))).toBe(true)
    expect(shouldRetry(2, err(503))).toBe(true)
    expect(shouldRetry(3, err(503))).toBe(false)
    expect(shouldRetry(0, err(429))).toBe(true)
  })
  it('does not retry 502 media_unavailable', () => {
    expect(shouldRetry(0, err(502))).toBe(false)
  })
  it('honours Retry-After and backs off exponentially', () => {
    expect(retryDelay(0, err(503, 5))).toBe(5000)
    const d = retryDelay(3, err(503))
    expect(d).toBeGreaterThanOrEqual(4000)
    expect(d).toBeLessThanOrEqual(8000)
  })
})
