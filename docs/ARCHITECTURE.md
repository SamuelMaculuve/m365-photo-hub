# Arquitectura — Plataforma de Gestão de Fotografias sobre Microsoft 365

> Estado: **implementado (MVP, fases 2–8)**. Fase 9 (IA) com a abstracção pronta e desligada.
> Data: 2026-09-29. Ver a secção J para o estado de cada marco e o que falta.

---

## 0. Decisões-chave (resumo)

| # | Decisão | Recomendação |
|---|---------|--------------|
| D1 | Identidade usada pelo motor de sincronização | **App-only (client credentials) + `Sites.Selected`** para bibliotecas SharePoint da organização; **delegada** apenas para o OneDrive pessoal de cada utilizador (opcional). |
| D2 | Autorização de visualização | Controlo **por biblioteca**, mapeado a **grupos do Entra ID**; o conteúdo binário é obtido com o token delegado do utilizador sempre que possível, para que o SharePoint aplique as suas próprias permissões. |
| D3 | Delta queries | Um cursor de delta **por drive** (na raiz), filtrando localmente pelas pastas configuradas — o OneDrive for Business/SharePoint **não suporta delta em sub-pastas**. |
| D4 | Miniaturas | Graph thumbnails servidas através de um **proxy do Laravel** com cache em disco/Redis (derivados pequenos, não originais). |
| D5 | Vídeo e originais | O backend valida o acesso e responde com **302 para o `downloadUrl` pré-autenticado** (curta duração, suporta `Range`). Sem streaming via PHP. |
| D6 | Autenticação SPA ↔ API | **Sessão por cookie (Laravel Sanctum, modo SPA)**. O browser nunca recebe tokens Microsoft. |
| D7 | Papéis globais | **App Roles do Entra ID** (claim `roles`), geridos no portal Entra. |
| D8 | Eliminação | Três níveis: ocultar na aplicação → Reciclagem do Microsoft 365 → (nunca) eliminação permanente pela aplicação no MVP. |
| D9 | Pesquisa | MVP com **MySQL FULLTEXT**; abstracção via Laravel Scout para migrar para Meilisearch/OpenSearch. |
| D10 | Repositório e ambiente | Monorepo: `backend/` (Laravel), `frontend/` (React), `docs/`. **Sem Docker**: desenvolvimento nativo em macOS (MAMP para PHP 8.3 + MySQL 8, Redis via Homebrew, Node 24). |

---

## A. Arquitectura do sistema

```text
┌──────────────────────────── Browser ─────────────────────────────┐
│ React + TS + Vite · TanStack Query · React Router · Tailwind     │
│ (grelha virtualizada, visualizador, i18n pt/en)                  │
└──────────────┬───────────────────────────────────▲───────────────┘
               │ HTTPS · cookie de sessão + CSRF    │ 302 → downloadUrl (vídeo/original)
               ▼                                    │
┌──────────────────────────── Laravel API ─────────────────────────┐
│ Controllers finos → Form Requests → Policies → Services         │
│  ├─ Services/Microsoft  (Graph client, auth, OneDrive, SP, ...) │
│  ├─ Services/Sync       (delta, reconciliação, âmbito)          │
│  ├─ Services/Media      (timeline, pesquisa, miniaturas)        │
│  ├─ Services/Sharing    (links da aplicação)                    │
│  └─ Services/Analysis   (MediaAnalysisService — desactivado)    │
│ Queues (Redis): sync · media · notifications   Scheduler (cron) │
└───────┬────────────────────────┬─────────────────────┬──────────┘
        ▼                        ▼                     ▼
   MySQL 8 (metadados,       Redis (sessões,       Microsoft Graph
   índices, álbuns,          cache, filas,         (v1.0, $batch,
   partilhas, auditoria)     rate-limit)           delta, thumbnails)
                                                       ▼
                                            OneDrive / SharePoint
                                            (fonte de verdade dos ficheiros)
```

### Responsabilidades (pergunta §52)

| Funcionalidade | Graph/OneDrive | Laravel | React | Redis | IA |
|---|---|---|---|---|---|
| Armazenamento de originais | ✅ único local | — | — | — | — |
| Detecção de alterações | ✅ `delta` | orquestra, persiste | — | locks | — |
| Metadados EXIF básicos | ✅ facetas `photo`, `image`, `video`, `location` | fallback: leitura parcial (`Range`) do cabeçalho EXIF | — | — | — |
| Miniaturas | ✅ `thumbnails` (small/medium/large/custom) | proxy + cache | lazy load | URLs em cache | — |
| Conversão HEIC → JPEG | ✅ via thumbnails custom (ex.: `c2048x2048`) | — | — | — | — |
| Timeline, agrupamento, paginação | — | ✅ SQL keyset | virtualização | cache de buckets | — |
| Álbuns, favoritos, tags | — | ✅ | UI | — | — |
| Pesquisa textual | (Graph search é limitado a nomes e não conhece álbuns) | ✅ | UI | cache | futuro semântico |
| Permissões de ficheiros | ✅ aplicadas no acesso ao conteúdo | ✅ ACL por biblioteca | — | cache (curto) | — |
| Links públicos | ❌ não usar `createLink` anónimo | ✅ tokens próprios | página pública | rate-limit | — |
| Pessoas/objectos/semântica | — | orquestra | UI | — | ✅ opcional |
| Geocodificação inversa | — | ✅ dataset offline (GeoNames) | mapa | cache | — |

---

## B. Fluxo de dados

### B.1 Sincronização

```text
Scheduler (a cada 5–15 min) ─► DispatchDriveSyncs
      └─► por cada drive activo: SyncDriveJob (fila "sync", lock Redis por drive)
             1. GET /drives/{id}/root/delta?token=…  ($select mínimo)
             2. para cada página (@odata.nextLink):
                  - pastas  → upsert em `drive_folders` (hierarquia)
                  - ficheiros media → classificar âmbito (está sob uma raiz de biblioteca?)
                        dentro   → upsert em `media` (por drive_id + item_id)
                        fora     → marcar `removed_from_scope`
                  - `deleted` → marcar como removido na origem
             3. guardar @odata.deltaLink em `drive_sync_states` (só no fim, atomicamente)
             4. emitir eventos: MediaDiscovered, MediaUpdated, MediaRemoved
                  └─► fila "media": ExtractMetadataJob, WarmThumbnailsJob, (AnalyzeMediaJob se IA activa)
      410 Gone (resyncRequired) → FullResyncJob com reconciliação (marca-e-varre)
```

Notas importantes:
- **Movimento de pastas**: o delta devolve a pasta movida, não necessariamente todos os descendentes. Por isso existe `drive_folders` com a hierarquia; `media.folder_path` é um campo desnormalizado recalculado em lote para os descendentes quando uma pasta muda de pai ou de nome.
- **Renomear/mover ficheiros**: a identidade é sempre `(drive_id, item_id)`; o nome e o caminho são apenas atributos.
- **Restauro na Reciclagem do M365**: o item reaparece no delta com o mesmo `item_id` → reactivado automaticamente.
- **Ficheiros duplicados**: tolerados; opcionalmente detectados via `file.hashes.quickXorHash` (índice `checksum`).

### B.2 Visualização da timeline

```text
React ─► GET /api/timeline/buckets            → [{month:"2026-09", count:412}, …]   (altura virtual do scroll)
      ─► GET /api/photos?cursor=…&limit=100   → keyset por (sort_at DESC, id DESC)
      ─► <img src="/api/media/{id}/thumbnail/medium">  → Laravel valida → cache hit? devolve : Graph → cache → devolve
Clique ─► /api/media/{id}/thumbnail/xlarge (imagem)  |  /api/media/{id}/stream (302 → downloadUrl) (vídeo)
```

Nunca se percorre o OneDrive num pedido HTTP de página; todas as leituras de listagem vêm do MySQL.

---

## C. Fluxo de autenticação

**Aplicação multi-tenant** registada no Entra ID (tenant "casa"), *confidential client*, **Authorization Code Flow + PKCE**, executado inteiramente no backend. Várias organizações (tenants Microsoft 365) partilham **um acervo comum**; só entram os tenants registados na tabela `organizations`.

```text
1. Browser → GET /auth/microsoft/redirect   (ou /auth/microsoft/link para ligar outra conta ao perfil actual)
2. Laravel gera state + nonce + PKCE (guardados na sessão) → 302 login.microsoftonline.com/organizations/oauth2/v2.0/authorize
3. Utilizador autentica-se no seu tenant (MFA/Acesso Condicional aplicados pelo Entra) e consente
4. Entra → GET /auth/microsoft/callback?code&state
5. Laravel valida state, troca code (+ client_secret ou certificado) por id_token + access_token + refresh_token
6. Valida id_token: assinatura (JWKS), aud, nonce, exp, iss == {authority}/{tid}/v2.0 e tid ∈ organizations activas
7. Encontra/cria a conta (`user_identities`) por (tid, oid) — nunca por email/UPN; no fluxo de ligação junta-a ao perfil com sessão
8. Lê claims `roles` (App Roles, só em organizações com trust_app_roles) e `groups` (se overage → Graph /me/transitiveMemberOf)
9. Guarda tokens cifrados (cast `encrypted`, APP_KEY) em `oauth_tokens`, um conjunto por conta ligada
10. Regenera a sessão; cookie HttpOnly, Secure, SameSite=Lax → redirect para o SPA
```

- **Perfis e contas**: um `user` (perfil) tem uma ou mais `user_identities` (uma por organização). Os grupos e os `oid` de todas as contas contam para o acesso às bibliotecas; o papel global é o maior das App Roles das contas em organizações de confiança (`trust_app_roles`), para que o administrador de um tenant parceiro não se possa promover a `super_admin`.
- **Identidade da aplicação por tenant**: o mesmo `client_id` tem um service principal em cada tenant (criado pelo consentimento de administrador); o token app-only é pedido a `/{tenant}/oauth2/v2.0/token` e guardado em `graph:app_token:{tenant}`. Cada drive pertence a uma organização e é sempre lido com o token desse tenant.

- **SPA ↔ API**: Sanctum em modo *stateful*; o SPA e a API partilham o domínio de topo (ex.: `fotos.org.mz` e `api.fotos.org.mz`, ou o mesmo host com `/api`). O frontend só vê `/api/users/me`.
- **Renovação de tokens**: `GraphAuthService::identityAccessToken($identity)` renova (no tenant da conta) automaticamente com margem de 5 min, com lock Redis para evitar renovações concorrentes; os refresh tokens rodam e são substituídos.
- **Revogação**: se a renovação falhar (`invalid_grant`), a sessão é invalidada e o utilizador volta a autenticar-se.
- **Identidade da aplicação (app-only)**: token obtido por client credentials, preferencialmente com **certificado** em vez de segredo em produção; em cache no Redis até expirar.
- **Logout**: destrói a sessão local e redireciona para o endpoint de logout do Entra (opcional).

---

## D. Permissões do Microsoft Graph (menor privilégio)

### D.1 Delegadas (em nome do utilizador autenticado)

| Permissão | Necessária para | Consentimento admin | Observações |
|---|---|---|---|
| `openid`, `profile`, `email` | Login OIDC | Não | Identidade básica. |
| `offline_access` | Refresh token | Não | Permite ao backend renovar sem novo login. |
| `User.Read` | Perfil do próprio utilizador | Não | Nome, foto, `oid`. |
| `Files.Read` | Ler o **próprio OneDrive** (bibliotecas pessoais) | Não | Só se a opção "O meu OneDrive" estiver activa. |
| `Files.Read.All` | Ler conteúdo de bibliotecas SharePoint/partilhadas **com as permissões do próprio utilizador** | Sim | Usado para obter conteúdo/miniaturas "como o utilizador", deixando o SharePoint decidir o acesso. |
| `Files.ReadWrite.All` | Carregar, mover, enviar para a Reciclagem | Sim | **Fase posterior**; pedido incrementalmente só a quem tem papel Editor/Contributor. |
| `GroupMember.Read.All` | Resolver grupos quando há *overage* de claims | Sim | Evitável se se usarem App Roles atribuídas a grupos. |

### D.2 De aplicação (sem utilizador — motor de sincronização)

| Permissão | Necessária para | Observações |
|---|---|---|
| **`Sites.Selected`** | Ler (ou escrever) **apenas os sites SharePoint explicitamente concedidos** | **Recomendado.** Um administrador do SharePoint concede `read` a sites concretos (`POST /sites/{id}/permissions`). |
| `Files.Read.All` / `Sites.Read.All` (aplicação) | Ler **todos** os ficheiros/sites do tenant | ❌ **Evitar.** Dá acesso a todo o OneDrive/SharePoint da organização; qualquer fuga do segredo expõe tudo. |

### D.3 Implicações de segurança

- **Delegadas**: o acesso efectivo é a *intersecção* entre a permissão concedida e o que o utilizador pode ver. Seguras, mas a sincronização fica dependente do refresh token de uma pessoa (se sair da organização, a sincronização pára). Por isso **não** usamos o token de um admin para sincronizar bibliotecas partilhadas.
- **Aplicação**: funcionam sem utilizador (ideal para sync e para links públicos), mas o token representa a aplicação inteira. Com `Sites.Selected` o raio de impacto fica limitado aos sites escolhidos.
- **Links públicos exigem identidade app-only**: um visitante anónimo não tem token; o backend tem de obter o ficheiro em nome da aplicação. Em bibliotecas só-delegadas, links públicos ficam desactivados.
- **Não pedir `Files.ReadWrite.All` no login inicial**: usar consentimento incremental quando a funcionalidade de escrita for activada.

---

## E. Esquema da base de dados (inicial)

Convenções: `BIGINT UNSIGNED` como PK interna; IDs do Graph como `VARCHAR(191)` (compatível com índices utf8mb4); datas de origem em UTC; `metadata` em JSON para campos flexíveis.

```text
users ──< oauth_tokens
  │ └──< user_library_access >── libraries ──< library_roots >── drives ──1 drive_sync_states
  │                                   │                              │
  │                                   └──────────< media >───────────┤──< drive_folders
  │                                                  │
  ├──< albums ──< album_media >──────────────────────┤
  ├──< user_media (favoritos, ocultos por utilizador)┤
  ├──< shares ──< share_media ───────────────────────┤
  ├──< audit_logs                                    ├──< media_analysis
  └──< sync_jobs ──< sync_logs                       └──< media_tags >── tags
settings (chave/valor)
```

### Tabelas principais

**users** — `id, entra_oid (UNIQUE), tenant_id, name, email, upn, locale (default 'pt'), app_role (cache do claim), last_login_at, timestamps, deleted_at`

**oauth_tokens** — `id, user_id FK, provider, access_token (encrypted TEXT), refresh_token (encrypted TEXT), scopes, expires_at, timestamps` · UNIQUE(user_id, provider)

**drives** — `id, drive_id (UNIQUE), drive_type ENUM(personal,business,documentLibrary), site_id NULL, name, web_url, owner_user_id NULL, auth_mode ENUM(app,delegated), timestamps`

**drive_sync_states** — `drive_id FK UNIQUE, delta_link TEXT, status, last_started_at, last_completed_at, last_error, items_seen, lock_version`

**drive_folders** — `id, drive_id FK, item_id, parent_item_id, name, path, is_deleted, timestamps` · UNIQUE(drive_id, item_id), INDEX(drive_id, parent_item_id)

**libraries** — `id, name, slug, description, type ENUM(sharepoint,onedrive_personal), enabled, allow_public_links, allow_uploads, timestamps, deleted_at`

**library_roots** — `id, library_id FK, drive_id FK, root_item_id, root_path, timestamps` (uma biblioteca pode ter várias pastas-raiz)

**user_library_access** — `id, library_id FK, principal_type ENUM(user,group), principal_id (oid do utilizador ou do grupo Entra), role ENUM(photo_admin,editor,contributor,viewer), timestamps` · UNIQUE(library_id, principal_type, principal_id)

**media**
```text
id                  BIGINT PK
library_id          FK
drive_id            FK → drives.id
item_id             VARCHAR(191)       -- ID do Graph (identidade real)
parent_item_id      VARCHAR(191)
name                VARCHAR(400)
folder_path         VARCHAR(1024)      -- desnormalizado, recalculado em moves
media_type          ENUM(image,video)
mime_type           VARCHAR(100)
size                BIGINT UNSIGNED
width, height       INT UNSIGNED NULL
duration_ms         INT UNSIGNED NULL
taken_at            DATETIME NULL      -- photo.takenDateTime / EXIF
source_created_at   DATETIME           -- fileSystemInfo.createdDateTime
source_modified_at  DATETIME
sort_at             DATETIME           -- taken_at ?? source_created_at (calculado pela aplicação: portável e indexável)
latitude, longitude DECIMAL(9,6) NULL
place_id            FK NULL → places
checksum            VARCHAR(64) NULL   -- quickXorHash
etag, ctag          VARCHAR(191)
web_url             VARCHAR(2048)
metadata            JSON               -- câmara, lente, ISO, abertura… (original)
source_state        ENUM(active,removed_at_source,out_of_scope)
hidden_at           DATETIME NULL      -- "lixo" da aplicação
hidden_by           FK NULL
timestamps
```
Índices:
- UNIQUE(`drive_id`, `item_id`)
- (`library_id`, `source_state`, `hidden_at`, `sort_at` DESC, `id` DESC) — timeline keyset
- (`drive_id`, `parent_item_id`)
- (`mime_type`), (`checksum`), (`place_id`)
- FULLTEXT(`name`, `folder_path`)

> `download_url` e `thumbnail_url` **não** são guardados em MySQL: são URLs pré-autenticados que expiram. Ficam no Redis com TTL inferior à sua validade.

**user_media** — `user_id, media_id, is_favourite, favourited_at, hidden, timestamps` · PK(user_id, media_id), INDEX(user_id, is_favourite)

**albums** — `id, owner_id FK, library_id FK NULL, name, description, cover_media_id FK NULL, visibility ENUM(private,library,organisation), timestamps, deleted_at`

**album_media** — `album_id, media_id, position, added_by, added_at` · PK(album_id, media_id), INDEX(album_id, position)

**shares** — `id, token_hash (UNIQUE, SHA-256 do token), created_by, shareable_type ENUM(media,album), shareable_id, audience ENUM(organisation,users,public), password_hash NULL, expires_at NULL, revoked_at NULL, view_count, last_accessed_at, timestamps`

**share_recipients** — `share_id, user_id` · **share_media** — `share_id, media_id` (partilha de selecção de várias fotos)

**tags / media_tags** — `tags(id, name, slug)`; `media_tags(media_id, tag_id, source ENUM(user,ai), confidence NULL, created_by)` — separa claramente tags humanas de IA.

**media_analysis** — `id, media_id FK, provider, analysis_type (labels, ocr, caption, embedding, faces), model_version, status, result JSON, cost_units, processed_at, timestamps` — nunca mistura com `media.metadata`.

**places** — `id, name, admin1 (província), country_code, latitude, longitude` (preenchido a partir de dataset offline)

**sync_jobs** — `id, drive_id FK, library_id NULL, type ENUM(initial,incremental,full_resync), status, total_estimate, processed, created, updated, removed, errors, started_at, finished_at, triggered_by`

**sync_logs** — `id, sync_job_id FK, level, code, message, item_id NULL, context JSON, created_at` (retenção 90 dias)

**audit_logs** — `id, user_id NULL, action, subject_type, subject_id, ip (anonimizável), user_agent_hash, result ENUM(success,denied,error), context JSON, created_at` — sem tokens, sem conteúdos pessoais desnecessários. Particionável por mês.

**settings** — `key (PK), value JSON, updated_by, updated_at`

Tabelas futuras (Fase 9, desactivadas): `people`, `face_detections`, `media_embeddings`.

---

## F. Estrutura de pastas

```text
OneDriveClone/
├── backend/                         # Laravel 11/12, PHP 8.3
│   ├── app/
│   │   ├── Enums/                    # Role, MediaType, SourceState, SyncType, AuthMode…
│   │   ├── Events/  Listeners/
│   │   ├── Exceptions/
│   │   │   ├── Handler.php           # mapeamento central → JSON amigável
│   │   │   ├── AuthenticationError.php  AuthorizationError.php
│   │   │   ├── GraphApiError.php  GraphThrottleError.php
│   │   │   ├── MediaNotFoundError.php  SyncError.php
│   │   ├── Http/
│   │   │   ├── Controllers/Api/{Photo,Album,Favourite,Search,Share,Timeline,Me}Controller.php
│   │   │   ├── Controllers/Api/Admin/{Library,Sync,User,Audit,Settings,Dashboard}Controller.php
│   │   │   ├── Controllers/Auth/MicrosoftAuthController.php
│   │   │   ├── Middleware/  Requests/  Resources/
│   │   ├── Jobs/Sync/{DispatchDriveSyncs,SyncDriveJob,FullResyncJob,RecomputeFolderPaths}.php
│   │   ├── Jobs/Media/{ExtractMetadataJob,WarmThumbnailsJob,AnalyzeMediaJob}.php
│   │   ├── Models/
│   │   ├── Policies/{MediaPolicy,AlbumPolicy,SharePolicy,LibraryPolicy}.php
│   │   ├── Services/
│   │   │   ├── Microsoft/
│   │   │   │   ├── GraphClient.php            # HTTP, retries, throttling, paginação, $batch
│   │   │   │   ├── GraphAuthService.php       # OIDC, tokens delegados e app-only
│   │   │   │   ├── OneDriveService.php        # drives, children, delta, items
│   │   │   │   ├── SharePointService.php      # sites, bibliotecas
│   │   │   │   ├── GraphThumbnailService.php
│   │   │   │   ├── GraphPermissionService.php
│   │   │   │   └── Dto/ (DriveItemData, DeltaPage…)
│   │   │   ├── Sync/{DeltaProcessor,ScopeResolver,FolderTreeService,SyncProgress}.php
│   │   │   ├── Media/{TimelineService,MediaAccessService,ThumbnailCache,ExifReader}.php
│   │   │   ├── Search/{SearchService,QueryParser}.php   # entende "setembro 2026", "vídeos"
│   │   │   ├── Sharing/ShareLinkService.php
│   │   │   ├── Analysis/{MediaAnalysisService.php, Contracts/AnalysisProvider.php, Providers/NullProvider.php}
│   │   │   └── Audit/AuditLogger.php
│   ├── config/microsoft.php
│   ├── database/migrations/  factories/  seeders/
│   ├── lang/{pt,en}/
│   ├── routes/{api.php,web.php,console.php}
│   └── tests/{Unit,Feature}/ + tests/Fixtures/graph/*.json   # respostas Graph simuladas
├── frontend/
│   ├── src/
│   │   ├── components/{photos,albums,viewer,search,layout,ui}/
│   │   ├── pages/{Photos,Albums,Favourites,People,Places,Search,Shared,Trash,Settings,Admin}/
│   │   ├── services/{api.ts,photos.ts,albums.ts,auth.ts,search.ts,admin.ts}
│   │   ├── hooks/{usePhotos,useTimeline,useAlbums,useSearch,useAuth}.ts
│   │   ├── layouts/DashboardLayout.tsx
│   │   ├── i18n/{index.ts, locales/pt.json, locales/en.json}
│   │   ├── lib/  types/  routes.tsx  main.tsx
│   └── tests/ (Vitest + Testing Library; Playwright para fluxos)
└── docs/{ARCHITECTURE,MICROSOFT_GRAPH,DATABASE,DEPLOYMENT,SECURITY,API}.md
```

O frontend nunca fala com o Graph; só conhece a API REST. Os tipos da API (`types/`) espelham os `Resources` do Laravel.

---

## G. Roteiro de desenvolvimento

| Marco | Conteúdo | Critério de conclusão |
|---|---|---|
| **M1 · Setup** | Monorepo, ambiente nativo (MAMP: PHP 8.3 + MySQL 8; Redis Homebrew; Node), Laravel + React esqueleto, `.env.example`, scripts `composer dev` / `npm run dev`, CI (lint + testes) | `php artisan serve` + `npm run dev` → página inicial e `/api/health` a responder |
| **M2 · Login Microsoft** | OIDC + PKCE, validação `tid`, tokens cifrados, Sanctum, `/api/users/me`, logout, App Roles | Login/logout reais com conta da organização; testes com IdP simulado |
| **M3 · GraphClient** | Retries com backoff exponencial + `Retry-After`, paginação, `$batch`, erros tipificados, User-Agent decorado | Testes unitários com fixtures (429, 503, 401, 404, 410) |
| **M4 · Navegação de drives** | Listar sites/drives/pastas (admin), criar biblioteca + raízes, validar permissões | Admin escolhe uma pasta SharePoint e vê os ficheiros |
| **M5 · Sincronização inicial** | `SyncDriveJob`, `drive_folders`, âmbito, progresso, `sync_jobs/logs` | 10k ficheiros de teste sincronizados, progresso visível |
| **M6 · Sincronização incremental** | Delta, moves/renomeações/eliminações/restauros, resync em 410, scheduler | Testes de cada cenário do §11 |
| **M7 · Timeline** | Buckets, keyset, grelha virtualizada, miniaturas via proxy + cache | Scroll fluido com 100k registos sintéticos |
| **M8 · Visualizador** | Teclado, swipe, zoom, info, vídeo via 302 | Fluxos Playwright |
| **M9 · Favoritos, álbuns** | CRUD, políticas | Testes de autorização |
| **M10 · Pesquisa** | FULLTEXT + filtros + parser pt/en | "setembro 2026", "vídeos", "favoritos" |
| **M11 · Partilha** | Links próprios, expiração, palavra-passe, revogação | Testes de token inválido/expirado/revogado |
| **M12 · Administração** | Dashboard, acessos, auditoria, erros de sync, definições | — |
| **M13 · Escrita** | Upload (upload session directo do browser), Reciclagem do M365 | Permissões incrementais |
| **M14 · Produção** | Supervisor, SSL, cabeçalhos, CSP, DEPLOYMENT.md | Deploy num Ubuntu de staging |
| **M15+ · IA** | MediaAnalysisService com provider real, locais, pessoas (opt-in) | Aprovação explícita da organização |

---

## H. Riscos e mitigação

| Risco | Detalhe | Mitigação |
|---|---|---|
| **Throttling do Graph/SharePoint** | 429/503 com `Retry-After`; limites por aplicação e por tenant (unidades de recurso do SharePoint); `$batch` conta cada sub-pedido | Respeitar `Retry-After`, backoff com jitter, concorrência limitada por drive, `$select` mínimo, sync fora de horas para o inicial, User-Agent `ISV|Org|App/versão` |
| **Delta só na raiz (Business/SharePoint)** | Não há delta por sub-pasta | Cursor por drive + filtro local de âmbito; bibliotecas dedicadas a fotos minimizam ruído |
| **Delta token expirado** | 410 `resyncRequired` | Resync completo com marca-e-varre, sem apagar dados de álbuns/favoritos |
| **Metadados incompletos** | `photo.takenDateTime` e `location` nem sempre preenchidos no SharePoint | Fallback: leitura parcial (`Range: bytes=0-131071`) para EXIF, sem guardar o ficheiro; depois `source_created_at` |
| **Miniaturas** | Nem todos os formatos geram miniatura (alguns HEIC/MOV/HEVC); URLs expiram; geração assíncrona no SharePoint | Placeholder, nova tentativa em fila, cache com TTL, tamanhos custom |
| **Vídeo** | MOV/HEVC não reproduz em todos os browsers; o Graph não transcodifica para streaming adaptativo | Reprodução directa via `downloadUrl` (Range); fallback: `POST /items/{id}/preview` (visualizador incorporado do M365) |
| **Autorização desfasada** | A cache local pode mostrar metadados de algo cujas permissões mudaram no SharePoint | ACL por biblioteca via grupos Entra (fonte única), conteúdo obtido com token delegado quando possível, re-verificação de pertença a grupos em cada login e com TTL curto |
| **SharePoint vs OneDrive pessoal** | APIs de restauro, delta e metadados diferem (ex.: `restore` não disponível em Business) | Camada `OneDriveService` com capacidades por `drive_type`; eliminação = Reciclagem do M365, restauro pela UI do M365 |
| **Bibliotecas grandes** | 100k+ itens; sync inicial demorado | Keyset pagination, índices compostos, sync em páginas com checkpoints retomáveis, `RecomputeFolderPaths` em lotes |
| **Gestão de tokens** | Refresh tokens roubados, revogados ou rodados | Cifra em repouso, nunca no browser, lock de renovação, `invalid_grant` → novo login; certificado para app-only; rotação de segredos documentada |
| **Links públicos** | Fuga de fotos internas | Desactivados por omissão por biblioteca; tokens de 32 bytes guardados como hash; expiração obrigatória configurável; auditoria; rate-limit |
| **Privacidade / GPS** | Coordenadas precisas revelam locais sensíveis | GPS só visível a quem tem acesso à foto; opção de arredondar coordenadas; remoção do GPS em links públicos |
| **Reconhecimento facial** | Dados biométricos; requisitos legais de protecção de dados | Desactivado por omissão, activação explícita pelo Super Administrador, consentimento, possibilidade de exclusão, dados separados e elimináveis |
| **Custos de IA** | Processar 100k imagens tem custo real | Processamento opcional, por biblioteca, com orçamentos/limites, usar miniaturas (não originais), registo de `cost_units` |
| **Dependência do Microsoft 365** | Indisponibilidade do Graph | Timeline continua a funcionar a partir do MySQL e da cache de miniaturas; mensagens amigáveis; circuit breaker |

---

## I. Decisões tomadas (questões em aberto da Fase 1)

Sem resposta explícita, avançou-se com as recomendações:

| Questão | Decisão implementada |
|---|---|
| 1. Âmbito do MVP | Bibliotecas **SharePoint** (modo `app`). O OneDrive pessoal é suportado em modo `delegated` (`MICROSOFT_PERSONAL_ONEDRIVE=true`), mas não é o foco |
| 2. Identidade da sincronização | **App-only + `Sites.Selected`** |
| 3. Links públicos | Implementados, mas **desligados por omissão** (definição global + opção por biblioteca + expiração obrigatória) |
| 4. Domínios | **Mesma origem** (Nginx serve o SPA e encaminha `/api`, `/auth` e `/sanctum`) |
| 5. Escrita | Implementada e **desligada por omissão** (`MICROSOFT_ENABLE_WRITES` + `allow_writes` por biblioteca): upload directo para a Microsoft e envio para a Reciclagem do M365 |
| Ambiente | **Sem Docker**: MAMP (PHP 8.3 + MySQL 8), Redis via Homebrew, Node 24 |
| Várias organizações (2026-09-30) | **Acervo comum**: um registo multi-tenant; cada tenant é uma `organization` (lista branca); cada pessoa liga as suas contas Microsoft (uma por organização) ao mesmo perfil. Bibliotecas "Todas as organizações" são visíveis a todos os utilizadores de todas as organizações; as restritas continuam por utilizador/grupo. App Roles só são aceites de tenants com `trust_app_roles` |

## J. Estado da implementação

| Marco | Estado | Verificação |
|---|---|---|
| M1 Setup | ✅ | Laravel 13 + React 19; `.env.example`; README |
| M2 Login Microsoft | ✅ | OIDC + PKCE, validação do id_token (JWKS), App Roles, grupos, tokens cifrados. Testado com IdP simulado (`AuthTest`). **Não testado contra um tenant real** |
| M3 GraphClient | ✅ | Retries, `Retry-After`, 401 → renovação, paginação, `$batch`, anti-SSRF (`GraphClientTest`) |
| M4 Navegação de drives | ✅ | Sites (nome/URL), bibliotecas, pastas, validação |
| M5/M6 Sincronização | ✅ | Inicial, incremental, checkpoints, moves/renomeações/eliminações, 410 → resync completo com marca-e-varre (`SyncTest`, com respostas Graph simuladas) |
| M7 Timeline | ✅ | Keyset, buckets, grelha virtualizada, scrubber, miniaturas com cache |
| M8 Visualizador | ✅ | Teclado, swipe, pinch, zoom, rotação, info, vídeo por 302 |
| M9 Favoritos/álbuns | ✅ | |
| M10 Pesquisa | ✅ | FULLTEXT (MySQL) + parser pt/en |
| M11 Partilha | ✅ | Organização, pessoas, público, palavra-passe, expiração, revogação, URLs assinados |
| M12 Administração | ✅ | Painel, bibliotecas, acessos, sincronização, utilizadores, auditoria, definições, erros |
| M13 Escrita | ✅ (desligada por omissão) | Upload por sessão de upload; Reciclagem M365 |
| M14 Produção | ✅ documentação | `deploy/` (Nginx, Supervisor, cron) e `DEPLOYMENT.md`. Não executado num servidor real |
| M16 Várias organizações | ✅ | `organizations`, `user_identities`, tokens app-only por tenant, ligação de contas, filtro por organização, página Admin › Organizações (`OrganizationTest`, `AuthTest`). **Não testado contra tenants reais** |
| M15 IA | 🟡 abstracção | `MediaAnalysisService` + `AnalysisProvider` (`NullProvider`); sem fornecedor real |

### Por fazer / limitações conhecidas

- Validar contra um **tenant Microsoft 365 real** (registo, Sites.Selected, sincronização de uma biblioteca grande) e o fluxo **multi-tenant** (consentimento noutro tenant, ligação de contas).
- **Pessoas / reconhecimento facial**: só a página informativa e a definição `faces_enabled`; sem modelo.
- **Mapa** em "Locais": lista de cartões com contagens (sem mapa interactivo).
- **Webhooks** do Graph para sincronização quase em tempo real (hoje: delta a cada 10 min).
- Autenticação da aplicação por **certificado**.
- Detecção de duplicados (`checksum` já indexado), eventos automáticos, álbuns inteligentes.
- Grelha quadrada (não "justified"); o scrubber carrega páginas até ao mês pedido (limite ~6 000 itens).
- Testes end-to-end automatizados (Playwright) não incluídos no repositório; o fluxo principal foi verificado
  manualmente num browser (login de desenvolvimento, timeline, visualizador, pesquisa, admin, mobile).
- Vídeos de demonstração não são reproduzíveis (só miniatura).
