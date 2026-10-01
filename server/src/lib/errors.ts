/**
 * Erros da aplicação. Cada erro tem um código estável (para o frontend), um estado HTTP e uma
 * mensagem amigável traduzida — nunca a mensagem interna do Graph ou da base de dados.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message = code,
    readonly context: Record<string, unknown> = {},
    readonly headers: Record<string, string> = {},
    /** Chave i18n da mensagem para o utilizador (por omissão errors.<code>). */
    readonly messageKey?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const unauthenticated = (msg = 'Unauthenticated', ctx = {}) => new AppError('unauthenticated', 401, msg, ctx)
export const forbidden = (msg = 'Forbidden', ctx = {}, messageKey?: string) => new AppError('forbidden', 403, msg, ctx, {}, messageKey)
export const notFound = (msg = 'Not found', ctx = {}) => new AppError('not_found', 404, msg, ctx)
export const conflict = (msg = 'Conflict', ctx = {}, messageKey?: string) => new AppError('conflict', 409, msg, ctx, {}, messageKey)
export const shareExpired = () => new AppError('share_expired', 410, 'Share expired')
export const sharePasswordRequired = (invalid = false) =>
  new AppError('share_password_required', 423, 'Share password required', {}, {}, invalid ? 'errors.share_password_invalid' : undefined)
export const mediaUnavailable = (msg = 'Media unavailable', ctx = {}) => new AppError('media_unavailable', 502, msg, ctx)

/** Erro de validação no formato { campo: [mensagens] }. */
export class ValidationError extends AppError {
  constructor(readonly errors: Record<string, string[]>) {
    super('validation_error', 422, 'Validation failed')
  }
}

export const validationError = (field: string, message: string) => new ValidationError({ [field]: [message] })

/** Erro devolvido pelo Microsoft Graph (ou pelo endpoint de tokens). */
export class GraphApiError extends AppError {
  constructor(
    message: string,
    readonly graphStatus: number,
    readonly graphCode: string | null = null,
    ctx: Record<string, unknown> = {},
  ) {
    super(graphStatus === 429 ? 'graph_throttled' : 'graph_unavailable', 503, message, ctx)
  }

  get isNotFound() { return this.graphStatus === 404 || this.graphStatus === 410 }
  get isForbidden() { return this.graphStatus === 403 }
}

export class GraphThrottleError extends GraphApiError {
  constructor(readonly retryAfter: number, ctx: Record<string, unknown> = {}) {
    super('Graph throttled', 429, 'throttled', ctx)
    Object.assign(this.headers, { 'Retry-After': String(retryAfter) })
  }
}
