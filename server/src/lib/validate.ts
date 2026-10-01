import { z } from 'zod'
import { ValidationError } from './errors'

/** Valida com zod; em caso de erro devolve 422 { errors: { campo: [mensagem] } }. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {})
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
