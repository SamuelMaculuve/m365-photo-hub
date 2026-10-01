import { sql, type SQL } from 'drizzle-orm'

/** "\" escapa % e _ nos padrões LIKE (SQLite não tem carácter de escape por omissão). */
export const escapeLike = (v: string) => v.replace(/[\\%_]/g, (m) => `\\${m}`)

/** LIKE sem distinção de maiúsculas (ASCII) com escape — equivalente ao ILIKE do Postgres. */
export const iLike = (col: unknown, pattern: string): SQL => sql`${col} like ${pattern} escape '\\'`

const ACCENTS: [string, string][] = [
  ['á', 'a'], ['à', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['å', 'a'], ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'], ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'], ['ç', 'c'], ['ñ', 'n'],
]
/** Texto sem maiúsculas nem acentos ("Formação" → "formacao"), em JavaScript. */
export const fold = (v: string) => {
  let out = v.toLowerCase()
  for (const [a, b] of ACCENTS) out = out.replaceAll(a, b)
  return out
}

/** Data (ms desde a época) → texto, em UTC. */
export const strftime = (format: string, col: unknown): SQL<string> => sql<string>`strftime(${format}, ${col} / 1000, 'unixepoch')`
