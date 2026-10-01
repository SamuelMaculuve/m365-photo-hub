/**
 * Desenvolvimento: aplica as migrações à base PGlite local (PGLITE_DIR, por omissão .data/pglite).
 * Em produção o Netlify aplica sozinho as migrações de netlify/database/migrations antes de publicar.
 */
import { createPgliteDb } from './client'

await createPgliteDb(process.env.PGLITE_DIR ?? '.data/pglite')
console.log('Migrações aplicadas (PGlite).')
