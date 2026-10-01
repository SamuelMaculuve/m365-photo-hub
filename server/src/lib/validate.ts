import { z } from 'zod'
import { ValidationError } from './errors'
import { currentLocale } from './request-context'

const FIELD_NAMES: Record<string, string> = {
  name: 'nome', description: 'descrição', visibility: 'visibilidade', email: 'email', locale: 'língua', roots: 'pastas',
  password: 'palavra-passe', expires_at: 'data de expiração', audience: 'audiência', type: 'tipo', ids: 'itens', media_ids: 'itens',
  role: 'papel', confirm: 'confirmação', q: 'pesquisa', file_name: 'nome do ficheiro', size: 'tamanho', place: 'local',
}

/** Mensagens de validação na língua do pedido (equivalentes às do Laravel). */
function message(issue: z.core.$ZodRawIssue): string {
  const en = currentLocale() === 'en'
  const key = String(issue.path?.at(-1) ?? '')
  const field = en ? key.replace(/_/g, ' ') : (FIELD_NAMES[key] ?? key.replace(/_/g, ' '))
  if (issue.code === 'invalid_type' && issue.input === undefined) return en ? `The ${field} field is required.` : `O campo ${field} é obrigatório.`
  if (issue.code === 'too_big') return en ? `The ${field} field is too long.` : `O campo ${field} é demasiado grande.`
  if (issue.code === 'too_small') return en ? `The ${field} field is too short.` : `O campo ${field} é demasiado pequeno.`
  return en ? `The ${field} field is invalid.` : `O campo ${field} não é válido.`
}

/** Valida com zod; em caso de erro devolve 422 { errors: { campo: [mensagem] } }. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {}, { error: (issue) => (issue.message && issue.code === 'custom' ? issue.message : message(issue)) })
  if (result.success) return result.data
  const errors: Record<string, string[]> = {}
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || '_'
    ;(errors[field] ??= []).push(issue.message)
  }
  throw new ValidationError(errors)
}

/** Query string → objecto (valores repetidos ficam no último). */
export const queryObject = (url: string) => Object.fromEntries(new URL(url).searchParams.entries())

/** Booleanos em query strings: "1", "true". */
export const boolish = z.preprocess((v) => (v === '1' || v === 'true' || v === true ? true : v === '0' || v === 'false' || v === false ? false : v), z.boolean())
export const intish = z.coerce.number().int()
