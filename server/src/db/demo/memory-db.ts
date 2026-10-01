import type { PGlite } from '@electric-sql/pglite'
import type { Db } from '../client'
import * as schema from '../schema'
import { SCHEMA_SQL } from './schema.generated'

/** Qualquer instrução que altere dados ou o esquema torna a base "suja" (tem de ser gravada no Blobs). */
const WRITE = /^\s*(with\b[\s\S]*\b)?(insert|update|delete|create|alter|drop|truncate)\b/i

export interface MemoryDatabase {
  pg: PGlite
  db: Db
  /** Houve escritas desde a última gravação. */
  isDirty(): boolean
  markClean(): void
}

/**
 * PGlite em memória, ligado directamente ao Drizzle (sem socket TCP).
 * Com `snapshot` carrega a cópia gravada; sem ela cria uma base nova com o esquema (SCHEMA_SQL).
 */
export async function openMemoryDatabase(snapshot?: Blob): Promise<MemoryDatabase> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const pg = snapshot ? await PGlite.create({ loadDataDir: snapshot }) : await PGlite.create()
  if (!snapshot) await pg.exec(SCHEMA_SQL)

  let dirty = false
  const track = (text: unknown) => {
    if (typeof text === 'string' && WRITE.test(text)) dirty = true
  }
  // O Drizzle chama query()/exec()/transaction(); detectar escritas sem alterar o código de acesso a dados.
  const client = new Proxy(pg, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      if (prop === 'query' || prop === 'exec') {
        return (text: unknown, ...rest: unknown[]) => {
          track(text)
          return (value as (...a: unknown[]) => unknown).call(target, text, ...rest)
        }
      }
      if (prop === 'transaction') {
        // Por segurança, uma transacção conta como escrita.
        return (...args: unknown[]) => {
          dirty = true
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return value.bind(target)
    },
  })

  const db = drizzle({ client: client as PGlite, schema }) as unknown as Db
  return { pg, db, isDirty: () => dirty, markClean: () => { dirty = false } }
}

/** Cópia comprimida da base inteira (diretório de dados do Postgres em tar.gz). */
export async function snapshotMemoryDatabase(mem: MemoryDatabase): Promise<Blob> {
  return mem.pg.dumpDataDir('gzip')
}
