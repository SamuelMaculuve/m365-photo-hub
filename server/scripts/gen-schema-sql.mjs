/**
 * Gera src/db/demo/schema.generated.ts a partir das migrações do drizzle-kit (server/drizzle/*.sql),
 * por ordem. O SQL fica dentro do bundle das funções (não depende de ficheiros no disco).
 * Corre em "npm run db:generate"; o teste test/demo.test.ts falha se o ficheiro estiver desactualizado.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
export function schemaSql() {
  const dir = join(root, 'drizzle')
  return readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').replaceAll('--> statement-breakpoint', '').trim())
    .join('\n\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(root, 'src', 'db', 'demo', 'schema.generated.ts')
  writeFileSync(out, `// Gerado por scripts/gen-schema-sql.mjs a partir de server/drizzle/*.sql — não editar.\nexport const SCHEMA_SQL = ${JSON.stringify(schemaSql())}\n`)
  console.log(`Escrito ${out}`)
}
