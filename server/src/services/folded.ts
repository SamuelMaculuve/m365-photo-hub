import { fold } from '../lib/sql'

/** Acrescenta as colunas de pesquisa (sem acentos) a partir dos campos de texto presentes. */
export function withFolded<T extends { name?: string | null; folderPath?: string | null; placeName?: string | null }>(row: T) {
  return {
    ...row,
    ...(row.name !== undefined ? { nameFolded: row.name === null ? null : fold(row.name) } : {}),
    ...(row.folderPath !== undefined ? { folderFolded: row.folderPath === null ? null : fold(row.folderPath) } : {}),
    ...(row.placeName !== undefined ? { placeFolded: row.placeName === null ? null : fold(row.placeName) } : {}),
  }
}
