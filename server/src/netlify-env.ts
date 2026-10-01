/**
 * Importado primeiro por todas as Netlify Functions: define o ambiente de produção.
 * - a base de dados tem de ser o Postgres do Netlify DB (o disco das funções é temporário);
 * - sem APP_ENV assume-se produção (cookies Secure, sem login de desenvolvimento);
 * - miniaturas no Netlify Blobs e sincronizações longas na Background Function.
 */
process.env.REQUIRE_DATABASE_URL = '1'
process.env.APP_ENV ||= 'production'
process.env.NETLIFY_FUNCTION = '1'
