import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/services/api'

const MAX_DELAY = 15_000

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    if (error.status === 503 || error.status === 429) return failureCount < 3
    if (error.status >= 400 && error.status < 500) return false
    if (error.status === 502) return false // ficheiro indisponível: repetir não ajuda
    if (error.status === 0) return failureCount < 2
    return failureCount < 1
  }
  return failureCount < 1
}

export function retryDelay(attempt: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfter != null) {
    return Math.min(error.retryAfter * 1000, MAX_DELAY * 2)
  }
  const base = Math.min(1000 * 2 ** attempt, MAX_DELAY)
  return base / 2 + Math.random() * (base / 2)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
