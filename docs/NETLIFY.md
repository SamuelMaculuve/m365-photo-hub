# Instalação no Netlify

Neste ramo (`feature/netlify-backend`) a aplicação inteira corre no Netlify:

```text
Browser ──► Netlify (CDN) ── frontend/dist (React, estático)
               │
               ├── /api/*, /auth/*, /sanctum/*  ──► Netlify Function "api" (server/, TypeScript + Hono)
               ├── a cada 5 min                 ──► Scheduled Function "sync-scheduled"
               └── sincronizações longas        ──► Background Function "sync-background" (até 15 min)
                                                      │
                     Netlify DB (Postgres/Neon) ◄─────┤
                     Netlify Blobs (miniaturas) ◄─────┘──► Microsoft Graph ──► OneDrive / SharePoint
```

O `backend/` Laravel deixa de ser usado neste ramo. A API mantém o mesmo contrato
([API.md](API.md)), por isso o frontend não muda.

## Diferenças em relação ao Laravel

| Laravel | Netlify |
|---|---|
| MySQL | Postgres: **Netlify DB** em produção, **PGlite** (Postgres embutido) em desenvolvimento e testes |
| Redis (sessões, cache, filas, locks) | Tabelas `sessions` e `cache_entries` no Postgres |
| Workers + cron | Função agendada (*/5) e função em segundo plano |
| Sincronização num job longo | Sincronização **por fatias**: cada invocação processa páginas do delta até ao limite de tempo, guarda o checkpoint e o estado, e a seguinte continua |
| Miniaturas em disco | Netlify Blobs (store `thumbnails`) |
| Rostos, IA e EXIF a partir do ficheiro (Python) | **Não disponíveis.** `features.faces` e `features.semantic_search` são sempre `false`. A data e o GPS vêm dos metadados do Microsoft 365 |
| Geocodificação GeoNames | Catálogo offline de localidades de Moçambique (`server/src/services/places-data.ts`) |

## 1. Criar o site

1. Ligue o repositório no Netlify (**Add new site → Import an existing project**) e escolha o ramo
   `feature/netlify-backend`. O `netlify.toml` já define o build, a pasta publicada e as funções.
2. Active o **Netlify DB**: no painel do site (**Extensions → Netlify DB**) ou com
   `npx netlify db init`. Isto cria a variável `NETLIFY_DATABASE_URL`.
   O build aplica as migrações (`npm run db:migrate`) e falha se a base não estiver configurada.

## 2. Variáveis de ambiente

Em **Site configuration → Environment variables**:

| Variável | Valor |
|---|---|
| `APP_KEY` | 32 bytes em base64: `openssl rand -base64 32`. Cifra os tokens Microsoft e assina URLs. **Não a mude depois**: os tokens guardados deixam de poder ser lidos |
| `APP_NAME` | Nome apresentado (ex.: `Fotos da Organização`) |
| `APP_ENV` | `production` |
| `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | Registo no Entra ID ([MICROSOFT_GRAPH.md](MICROSOFT_GRAPH.md)) |
| `MICROSOFT_REDIRECT_URI` | `https://<o-seu-site>.netlify.app/auth/microsoft/callback` (ou o domínio próprio) |
| `MICROSOFT_BOOTSTRAP_SUPER_ADMINS` | Emails que recebem `super_admin` no primeiro login |
| `MICROSOFT_ENABLE_WRITES` | `true` só se quiser uploads e envio para a Reciclagem |
| `SYNC_INTERVAL_MINUTES` | Opcional (omissão 10) |

No Entra ID, acrescente o mesmo `MICROSOFT_REDIRECT_URI` em **Authentication → Redirect URIs** (plataforma Web).

## 3. Primeiro deploy

1. Faça o deploy e entre com uma conta indicada em `MICROSOFT_BOOTSTRAP_SUPER_ADMINS`.
2. Em **Administração → Bibliotecas**, crie uma biblioteca e inicie a sincronização.
3. A sincronização inicial avança em segundo plano; acompanhe-a em **Administração → Sincronização**.

As funções agendadas só correm em deploys publicados (não em deploy previews). Se o seu plano não
incluir Background Functions, a função agendada continua o trabalho a cada 5 minutos, mais devagar.

## Desenvolvimento local

```bash
cd server && npm install
APP_KEY=$(openssl rand -base64 32) AUTH_DEV_LOGIN=true npm run dev   # API em http://127.0.0.1:8000, PGlite em server/.data
cd ../frontend && npm run dev                                          # http://localhost:5173 (proxy para a porta 8000)
```

O backend Laravel usa a mesma porta 8000: pare-o antes. Para usar o login Microsoft localmente, defina
também as variáveis `MICROSOFT_*` (com `MICROSOFT_REDIRECT_URI=http://localhost:5173/auth/microsoft/callback`).
Os dados locais ficam em `server/.data/pglite`; apague a pasta para recomeçar.

Testes e tipos:

```bash
cd server && npm test && npm run typecheck
```

## Limites a ter em conta

- **Tempo por invocação**: os pedidos da API têm limites de segundos. Miniaturas e vídeos vêm do
  Microsoft 365 (miniaturas ficam em cache no Netlify Blobs; vídeos e originais são um redirect).
- **Bibliotecas muito grandes**: a primeira sincronização demora mais do que num servidor, porque avança
  por fatias. Fica retomável: um erro ou um timeout não perde o progresso.
- **Custos**: invocações de funções, leituras de Blobs e a base de dados contam para o plano do Netlify.
