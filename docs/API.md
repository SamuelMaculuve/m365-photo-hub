# API REST

Base: `/api`. Todas as rotas (excepto `/api/public/*` e `/api/health`) exigem sessão autenticada
(Laravel Sanctum, modo SPA — cookie de sessão + `X-XSRF-TOKEN`).

O SPA e a API são servidos na **mesma origem** (em desenvolvimento o Vite faz proxy de `/api`, `/auth` e `/sanctum` para `http://127.0.0.1:8000`).

Antes de qualquer `POST/PUT/PATCH/DELETE`, o cliente chama uma vez `GET /sanctum/csrf-cookie`
e envia o valor do cookie `XSRF-TOKEN` no cabeçalho `X-XSRF-TOKEN` (o axios faz isto automaticamente com `withCredentials` + `withXSRFToken`).

## Convenções

### Sucesso

```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "next_cursor": "eyJ...", "per_page": 100 } }
```

Listas grandes (fotos, pesquisa, lixo, álbum, auditoria) usam **paginação por cursor**: enviar `cursor=<meta.next_cursor>`; `next_cursor = null` significa fim.
Listas pequenas (álbuns, bibliotecas, utilizadores) usam paginação clássica com `meta.current_page`, `meta.per_page`, `meta.total`, `meta.last_page`.

### Erros

```json
{ "error": { "code": "media_unavailable", "message": "Mensagem amigável já traduzida", "errors": { "campo": ["..."] } } }
```

| HTTP | code | Significado |
|---|---|---|
| 401 | `unauthenticated` | Sessão inexistente/expirada → redireccionar para login |
| 403 | `forbidden` | Sem permissão |
| 404 | `not_found` | Recurso inexistente ou invisível para o utilizador |
| 409 | `conflict` | Estado inválido (ex.: sincronização já a decorrer) |
| 410 | `share_expired` | Link de partilha expirado/revogado |
| 422 | `validation_error` | `errors` contém os campos |
| 423 | `share_password_required` | Link público exige palavra-passe |
| 429 | `too_many_requests` | Rate limit da aplicação |
| 502 | `media_unavailable` | Ficheiro não pôde ser obtido do Microsoft 365 (apagado, movido, sem permissão) |
| 503 | `graph_unavailable` / `graph_throttled` | Microsoft 365 indisponível ou a limitar pedidos; `Retry-After` pode vir no cabeçalho |

A língua das mensagens segue `users.locale` (ou `Accept-Language` em rotas públicas). Omissão: `pt`.

---

## Objectos

### Media (lista)

```json
{
  "id": 123,
  "name": "IMG_2026_0012.jpg",
  "type": "image",                      // "image" | "video"
  "mime_type": "image/jpeg",
  "width": 4032, "height": 3024,        // podem ser null
  "duration_ms": null,                  // vídeos
  "taken_at": "2026-09-28T10:22:00Z",   // pode ser null
  "sort_at": "2026-09-28T10:22:00Z",    // taken_at ?? criação — usar para agrupar
  "size": 3481223,
  "library_id": 1,
  "is_favourite": false,
  "thumbnails": {
    "small":  "/api/photos/123/thumbnail/small",    // ~96px
    "medium": "/api/photos/123/thumbnail/medium",   // ~320px (grelha)
    "large":  "/api/photos/123/thumbnail/large",    // ~800px
    "xlarge": "/api/photos/123/thumbnail/xlarge"    // ~2048px (visualizador)
  },
  "stream_url": null                    // vídeos: "/api/photos/123/stream"
}
```

### Media (detalhe) — acrescenta

```json
{
  "folder_path": "/Fotos/2026/Formação",
  "web_url": "https://org.sharepoint.com/...",   // abrir no Microsoft 365
  "download_url": "/api/photos/123/download",
  "source_created_at": "...", "source_modified_at": "...",
  "metadata": { "camera_make": "Apple", "camera_model": "iPhone 15", "iso": 100,
                "f_number": 1.8, "exposure_time": "1/120", "focal_length": 6.9, "orientation": 1 },
  "location": { "latitude": -25.9692, "longitude": 32.5732, "place": "Maputo" },  // ou null
  "albums": [ { "id": 4, "name": "Formação CRP IV" } ],
  "tags": [ { "name": "formação", "source": "user" } ],
  "library": { "id": 1, "name": "Fotos Institucionais" },
  "hidden_at": null,
  "can": { "trash": true, "restore": false, "delete_from_source": false, "share": true, "add_to_album": true }
}
```

### Album

```json
{ "id": 4, "name": "Formação CRP IV", "description": "...", "visibility": "private",   // private | organisation
  "media_count": 42, "cover": { "id": 123, "thumbnails": { ... } } | null,
  "owner": { "id": 1, "name": "Samuel" },
  "created_at": "...", "updated_at": "...",
  "can": { "update": true, "delete": true, "share": true } }
```

### User (me)

```json
{ "id": 1, "name": "Samuel", "email": "s@org.mz", "locale": "pt",
  "role": "super_admin",               // super_admin | photo_admin | editor | contributor | viewer
  "permissions": { "admin": true, "manage_libraries": true, "manage_sync": true,
                   "manage_users": true, "view_audit": true, "delete_from_source": true, "upload": true },
  "libraries": [ { "id": 1, "name": "Fotos Institucionais", "role": "viewer" } ] }
```

---

## Autenticação (rotas web, não `/api`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/auth/microsoft/redirect` | Inicia o login com a Microsoft (navegação completa, não XHR) |
| GET | `/auth/microsoft/callback` | Callback OAuth; redirecciona para `/` ou `/login?error=<code>` com `code` ∈ `login_failed`, `invalid_state`, `invalid_tenant`, `access_denied`, `account_disabled` |
| POST | `/auth/logout` | Termina sessão → `{ "data": { "logout_url": "https://login.microsoftonline.com/..." } }` |
| POST | `/auth/dev-login` | **Só com `APP_ENV=local` e `AUTH_DEV_LOGIN=true`**: `{ "email": "..." }` inicia sessão sem Microsoft |
| GET | `/api/auth/config` | Público: `{ "data": { "app_name": "...", "microsoft_configured": true, "dev_login": false } }` |

## Utilizador

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/users/me` | Utilizador actual (objecto acima) |
| PATCH | `/api/users/me` | `{ "locale": "pt" \| "en" }` |
| GET | `/api/users/search?q=` | Procura utilizadores da aplicação (para partilhar) → `[{id,name,email}]` |

## Fotos e vídeos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/timeline/buckets` | `[{ "month": "2026-09", "count": 412 }]` (desc). Aceita os mesmos filtros que `/api/photos` |
| GET | `/api/photos` | Lista por `sort_at DESC`. Filtros: `cursor`, `limit` (1–200, omissão 100), `type=image\|video`, `library_id`, `from`, `to` (YYYY-MM-DD), `favourite=1`, `place` |
| GET | `/api/photos/{id}` | Detalhe |
| GET | `/api/photos/{id}/thumbnail/{size}` | `small\|medium\|large\|xlarge` → imagem (JPEG/PNG), `Cache-Control: private, max-age=86400` |
| GET | `/api/photos/{id}/stream` | Vídeo → `302` para URL temporário do Microsoft 365 (suporta Range) |
| GET | `/api/photos/{id}/download` | Original → `302` para URL temporário |
| POST | `/api/photos/{id}/favorite` | Marca favorito → `{ "data": { "is_favourite": true } }` |
| DELETE | `/api/photos/{id}/favorite` | Remove favorito |
| DELETE | `/api/photos/{id}` | Envia para o **lixo da aplicação** (reversível; o ficheiro no OneDrive não é tocado) |
| POST | `/api/photos/{id}/restore` | Restaura do lixo da aplicação |
| POST | `/api/photos/{id}/delete-from-source` | `{ "confirm": "DELETE" }` — envia o ficheiro para a **Reciclagem do Microsoft 365**. Só `photo_admin`/`super_admin`, biblioteca com escrita |
| POST | `/api/photos/bulk` | `{ "action": "favorite"\|"unfavorite"\|"trash"\|"restore", "ids": [..] }` (máx. 500) |
| GET | `/api/trash` | Itens no lixo da aplicação (cursor) |

## Álbuns

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/albums` | Álbuns próprios + da organização. `?page`, `?q` |
| POST | `/api/albums` | `{ name, description?, visibility? }` |
| GET | `/api/albums/{id}` | Detalhe |
| PUT | `/api/albums/{id}` | `{ name?, description?, visibility?, cover_media_id? }` |
| DELETE | `/api/albums/{id}` | Apaga o álbum (nunca as fotos) |
| GET | `/api/albums/{id}/media` | Fotos do álbum (cursor), só as que o utilizador pode ver |
| POST | `/api/albums/{id}/media` | `{ "media_ids": [..] }` |
| DELETE | `/api/albums/{id}/media` | `{ "media_ids": [..] }` |

## Pesquisa e locais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/search` | `q` + filtros (`type`, `from`, `to`, `folder`, `album_id`, `favourite`, `library_id`, `place`, `cursor`). Entende "setembro 2026", "2025", "vídeos", "favoritos", "videos", "september 2026". `meta.interpreted = { text, type, from, to, favourite }` |
| GET | `/api/search/suggestions?q=` | `{ folders: [..], albums: [{id,name}], places: [..] }` |
| GET | `/api/places` | `[{ "name": "Maputo", "admin1": "Maputo Cidade", "count": 120, "latitude": .., "longitude": .., "cover": Media }]` |
| GET | `/api/libraries` | Bibliotecas acessíveis `[{ id, name, description, media_count, allow_writes }]` |
| POST | `/api/libraries/{id}/uploads` | `{ file_name, size, root_id? }` → `{ data: { upload_url, expires_at, chunk_size } }`. Exige `allow_writes` e papel ≥ contributor. O browser envia os blocos **directamente** para `upload_url` (URL pré-autenticado da Microsoft, sem cookies) com `Content-Range`; o ficheiro aparece na sincronização seguinte |

## Partilha

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/shares` | Partilhas criadas por mim |
| POST | `/api/shares` | `{ "type": "album"\|"media", "album_id"?, "media_ids"?, "audience": "organisation"\|"users"\|"public", "user_ids"?, "expires_at"?, "password"? }` → `{ data: { id, url, token (só nesta resposta), ... } }` |
| DELETE | `/api/shares/{id}` | Revoga |
| GET | `/api/shared-with-me` | Partilhas recebidas (sem token) |
| GET | `/api/shares/{id}/items` | Destinatário/criador abre uma partilha interna pelo id → mesmo formato que o link público |
| GET | `/api/public/shares/{token}` | Público (ou organização autenticada). Cabeçalho `X-Share-Password` se protegido. → `{ data: { id, title, type, audience, expires_at, created_by, items: [Media] } }` |
| GET | `/api/public/share-content/{shareId}/{mediaId}/thumbnail/{size}?expires&signature` | Miniatura (URL assinado, 2 h) |
| GET | `/api/public/share-content/{shareId}/{mediaId}/download?expires&signature` | Original (302) |

Nos payloads de partilha, `thumbnails.*`, `stream_url` e `download_url` são **URLs relativos já assinados**.
Usam-se tal como vêm, sem os reconstruir a partir do id. Revogação e expiração são verificadas em cada pedido.

Links públicos: `https://<host>/s/<token>` (página React).

## Administração (`/api/admin`)

`photo_admin` (ou superior): `dashboard`, `sync/*`, `errors`, `GET libraries`.
`super_admin`: criar/editar bibliotecas, acessos, navegador Graph, utilizadores, definições e auditoria.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | `{ photos, videos, albums, users, storage_bytes, last_sync_at, sync_errors_24h, unprocessed, running_jobs, status: "healthy"\|"degraded"\|"error", ai_enabled }` |
| GET | `/libraries` | Todas as bibliotecas com roots e estado |
| POST | `/libraries` | `{ name, description?, visibility: "organisation"\|"restricted", allow_public_links, allow_writes, roots: [{ drive_id, item_id }] }` |
| PUT | `/libraries/{id}` | Actualiza (inclui `enabled`) |
| DELETE | `/libraries/{id}` | Remove da aplicação (não toca no OneDrive) |
| POST | `/libraries/{id}/validate` | Valida acesso Graph → `{ ok, checks: [{ key, ok, message }] }` |
| GET | `/libraries/{id}/access` / PUT | GET → `[{ principal_type: "user"\|"group", principal_id, display_name, role }]`; PUT body `{ "entries": [...] }` (ou `{ "access": [...] }`) |
| GET | `/graph/sites?q=` | Procura sites SharePoint por nome (token do admin) ou por URL `https://...sharepoint.com/sites/X` (identidade da aplicação, funciona com Sites.Selected) → `[{ id, name, web_url }]` |
| GET | `/graph/sites/{siteId}/drives` | Bibliotecas de documentos do site |
| GET | `/graph/drives/{driveId}/children?item_id=` | Sub-pastas `[{ id, name, child_count, path }]`; sem `item_id` (ou `root`) → raiz |
| GET | `/sync/status` | `{ running: [SyncJob], drives: [{ id, name, status, last_completed_at, last_error }] }` |
| POST | `/sync` | `{ library_id?, full?: bool }` → inicia (202) |
| GET | `/sync/jobs` | Histórico (paginado) |
| GET | `/sync/jobs/{id}/logs` | Logs do job |
| GET | `/audit-logs` | Cursor; filtros `action`, `user_id`, `from`, `to` |
| GET | `/users` / PUT `/users/{id}` | Lista; `{ role?, is_active? }` |
| GET | `/settings` / PUT | `{ public_links_enabled, max_share_days, ai_enabled, faces_enabled, gps_precision }` |
| GET | `/errors` | Últimos erros relevantes (sync_logs level=error + graph) |

SyncJob:
```json
{ "id": 9, "drive": { "id": 2, "name": "Documentos" }, "type": "incremental", "status": "running",
  "processed": 12458, "total_estimate": 15920, "created": 30, "updated": 2, "removed": 1, "errors": 0,
  "progress": 78.2, "eta_seconds": 140, "started_at": "...", "finished_at": null }
```

## Pessoas (reconhecimento facial — local, opcional)

Disponível quando `GET /api/users/me` devolve `features.faces = true` (definição `faces_enabled` activa).
Só aparecem pessoas com rostos em fotografias que o utilizador pode ver; as contagens também são filtradas.

Person:
```json
{ "id": 7, "name": "Maria" | null, "face_count": 23, "is_hidden": false,
  "thumbnail": "/api/people/7/thumbnail", "can": { "update": true, "suppress": false } }
```

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/people` | Pessoas com ≥ 2 rostos visíveis, por `face_count` desc. `?hidden=1` inclui ocultas (editor+). `?q=` filtra por nome |
| GET | `/api/people/{id}` | Detalhe |
| GET | `/api/people/{id}/media` | Fotos onde a pessoa aparece (cursor, formato de `/api/photos`) |
| GET | `/api/people/{id}/thumbnail` | Recorte do rosto (JPEG ~256 px) |
| PATCH | `/api/people/{id}` | `{ name?: string\|null, is_hidden?: bool }` — editor+ |
| POST | `/api/people/{id}/merge` | `{ "into_id": 9 }` — junta esta pessoa na 9 (editor+) → devolve a pessoa resultante |
| DELETE | `/api/people/{id}` | **Excluir do reconhecimento** (opt-out): apaga os rostos e impede novos agrupamentos desta pessoa — super_admin |
| DELETE | `/api/faces/{id}` | "Não é esta pessoa": remove um rosto do agrupamento (editor+) |

Detalhe de foto (`GET /api/photos/{id}`) passa a incluir:
```json
"people": [ { "id": 7, "name": "Maria", "face_id": 120, "box": [0.41, 0.22, 0.05, 0.08] } ]
```
(`box` = x, y, largura, altura normalizados 0–1; só pessoas visíveis/não ocultas.)

Admin:
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/admin/faces/status` | `{ enabled, available, scanned, pending, faces, people }` |
| POST | `/api/admin/faces/purge` | `{ "confirm": "APAGAR" }` — apaga **todos** os dados faciais (super_admin) |

Bibliotecas (admin): novo campo booleano `allow_faces` (como `allow_ai`).
