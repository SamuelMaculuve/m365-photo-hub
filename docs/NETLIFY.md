# Instalação no Netlify

Neste ramo (`feature/netlify-backend`) a aplicação inteira corre no Netlify:

```text
Browser ──► Netlify (CDN) ── frontend/dist (React, estático)
               │
               ├── /api/*, /auth/*, /sanctum/*  ──► Netlify Function "api" (server/, TypeScript + Hono)
               ├── de hora a hora               ──► Scheduled Function "sync-scheduled"
               └── sincronizações longas        ──► Background Function "sync-background" (até 15 min)
                                                      │
                     Netlify Blobs (cópia da base) ◄──┤
                     Netlify Blobs (miniaturas) ◄─────┘──► Microsoft Graph ──► OneDrive / SharePoint
```

O `backend/` Laravel deixa de ser usado neste ramo. A API mantém o mesmo contrato
([API.md](API.md)), por isso o frontend não muda.

## Diferenças em relação ao Laravel

| Laravel | Netlify |
|---|---|
| MySQL | Postgres. **Modo demonstração** (sem `DATABASE_URL`): PGlite em memória na função, com a base guardada no Netlify Blobs. **Modo real**: o Postgres de `DATABASE_URL`. PGlite em desenvolvimento e testes |
| Redis (sessões, cache, filas, locks) | Tabelas `sessions` e `cache_entries` no Postgres |
| Workers + cron | Função agendada (de hora a hora, só acorda a base quando há sincronização em atraso) e função em segundo plano |
| Sincronização num job longo | Sincronização **por fatias**: cada invocação processa páginas do delta até ao limite de tempo, guarda o checkpoint e o estado, e a seguinte continua |
| Miniaturas em disco | Netlify Blobs (store `thumbnails`) |
| Rostos, IA e EXIF a partir do ficheiro (Python) | **Não disponíveis.** `features.faces` e `features.semantic_search` são sempre `false`. A data e o GPS vêm dos metadados do Microsoft 365 |
| Geocodificação GeoNames | Catálogo offline de localidades de Moçambique (`server/src/services/places-data.ts`) |

## 1. Criar o site

1. Ligue o repositório no Netlify (**Add new site → Import an existing project**) e escolha o ramo
   `feature/netlify-backend`. O `netlify.toml` já define o build, a pasta publicada e as funções.
2. Escolha a base de dados:
   - **Modo demonstração (omissão, plano Free, sem serviços externos):** não defina `DATABASE_URL`.
     No primeiro pedido, a função cria um Postgres em memória (PGlite) com o esquema e dados de exemplo e
     publica uma cópia comprimida (~5 MB) no Netlify Blobs (store `demo-db`). Antes de cada pedido cada
     instância verifica a versão da cópia e recarrega-a se outra instância gravou; depois de cada pedido que
     **alterou dados**, grava uma versão nova antes de responder.
   - **Modo real:** defina `DATABASE_URL` com um Postgres (ex.: `postgresql://…?sslmode=require`). As
     migrações aplicam-se no build (`npm run db:migrate`).

   **Limites do modo demonstração:** se duas pessoas gravarem ao mesmo tempo em instâncias diferentes, a
   última gravação ganha (a outra alteração perde-se). Cada pedido que altera dados envia a cópia inteira
   para o Blobs (cerca de 1 s a mais). Serve para demonstrações com poucas pessoas, não para produção.

   **Repor a demonstração:** apague a entrada da store `demo-db` em **Blobs** no painel do Netlify; o pedido
   seguinte cria a base de raiz com os dados de exemplo. Alterar o esquema também começa uma base nova.

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
| `SYNC_INTERVAL_MINUTES` | Opcional (omissão 360 = 6 h; valores baixos gastam mais créditos) |
| `DATABASE_URL` | Opcional: Postgres real. Sem ela, o site corre em modo demonstração |
| `DEMO_LOGIN` | `true` para entrar só com um email, sem Microsoft (**só no modo demonstração**; a primeira conta fica `super_admin`). Nunca o active com dados reais |

No Entra ID, acrescente o mesmo `MICROSOFT_REDIRECT_URI` em **Authentication → Redirect URIs** (plataforma Web).

## 3. Primeiro deploy

1. Faça o deploy e entre com uma conta indicada em `MICROSOFT_BOOTSTRAP_SUPER_ADMINS`.
2. Em **Administração → Bibliotecas**, crie uma biblioteca e inicie a sincronização.
3. A sincronização inicial avança em segundo plano; acompanhe-a em **Administração → Sincronização**.

As funções agendadas só correm em deploys publicados (não em deploy previews). A sincronização
automática acontece de 6 em 6 horas (`SYNC_INTERVAL_MINUTES`); um administrador pode pedi-la a qualquer
momento em **Administração → Sincronização**.

## Desenvolvimento local

```bash
cd server && npm install
APP_KEY=$(openssl rand -base64 32) AUTH_DEV_LOGIN=true npm run dev   # API em http://127.0.0.1:8000, PGlite em server/.data/pglite
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
- **Plano Free (300 créditos/mês, limite rígido)**: as funções gastam 10 créditos por GB-hora, os pedidos
  2 créditos por 10 000, o tráfego 20 por GB e cada deploy em produção 15. No modo demonstração a base
  vive na função (sem custo de base de dados), mas cada instância nova demora ~1 s a arrancá-la e cada
  gravação envia ~5 MB para o Blobs. Acompanhe o consumo em **Usage & billing** no painel do Netlify.
- **Poupar créditos**: evite deploys desnecessários em produção e não baixe `SYNC_INTERVAL_MINUTES`.
