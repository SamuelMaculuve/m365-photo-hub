/** Semeia a base local (PGlite em PGLITE_DIR, por omissão .data/pglite) com os dados de demonstração. */
import { createPgliteDb } from '../client'
import { seedDemo } from './seed'

await seedDemo(await createPgliteDb(process.env.PGLITE_DIR ?? '.data/pglite'))
console.log('Dados de demonstração criados.')
process.exit(0)
