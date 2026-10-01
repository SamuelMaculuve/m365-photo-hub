/**
 * Importado primeiro por todas as Netlify Functions: define o ambiente de produção.
 * - sem DATABASE_URL a base corre em modo demonstração (PGlite + Netlify Blobs);
 * - sem APP_ENV assume-se produção (cookies Secure, sem login de desenvolvimento);
 * - miniaturas no Netlify Blobs e sincronizações longas na Background Function.
 */
process.env.APP_ENV ||= 'production'
process.env.NETLIFY_FUNCTION = '1'
