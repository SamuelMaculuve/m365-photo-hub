# Base de dados

MySQL 8 (`utf8mb4`). Migrações em `backend/database/migrations`. Os testes usam SQLite em memória.

## Diagrama

```text
users ──< oauth_tokens
  │
  ├──< albums ──< album_media >──┐
  ├──< user_media (favoritos) >──┤
  ├──< shares ──< share_media >──┤          drives ──1 drive_sync_states
  │        └──< share_recipients │            │  └──< drive_folders
  ├──< audit_logs                │            │
  └──< sync_jobs ──< sync_logs   │            ├──< library_roots >── libraries ──< library_access
                                 └──────── media ◄────────────────────┘
                                             ├──< media_tags >── tags
                                             └──< media_analysis
settings (chave/valor)
```

## Tabelas

### Identidade

| Tabela | Colunas principais | Notas |
|---|---|---|
| `organizations` | `name`, `slug` (único), `tenant_id` (único), `domains` (JSON), `color`, `enabled`, `trust_app_roles`, `consented_at` | Tenants Microsoft 365 autorizados (lista branca do login e da sincronização) |
| `users` | `name`, `email`, `upn`, `locale`, `role`, `role_source` (`entra`/`local`), `is_active`, `last_login_at` | Perfil. Soft delete. Pode ter várias contas Microsoft ligadas |
| `user_identities` | `user_id`, `organization_id`, `tenant_id`, `entra_oid`, `email`, `upn`, `app_role`, `group_ids` (JSON), `groups_synced_at`, `last_login_at` | Único por `(tenant_id, entra_oid)` e por `(user_id, organization_id)`. A conta é identificada pelo `oid`, não pelo email |
| `oauth_tokens` | `user_id`, `identity_id`, `access_token`, `refresh_token` (cifrados), `scopes`, `expires_at` | Único por `(identity_id, provider)`: um conjunto de tokens por conta ligada |
| `sessions` | Driver `database` opcional; em produção usa-se Redis | |

### Armazenamento Microsoft

| Tabela | Colunas principais | Notas |
|---|---|---|
| `drives` | `organization_id`, `drive_id` (Graph, único), `drive_type` (`documentLibrary`/`business`/`personal`/`demo`), `site_id`, `auth_mode` (`app`/`delegated`), `owner_user_id` | |
| `drive_sync_states` | `delta_link`, `resume_link` (checkpoint), `status`, `last_completed_at`, `last_error`, `items_seen` | Um cursor delta por drive |
| `drive_folders` | `(drive_id, item_id)` único, `parent_item_id`, `name`, `is_root`, `is_deleted` | Hierarquia para calcular caminhos e âmbito (o delta não reenvia descendentes quando se move uma pasta) |
| `libraries` | `organization_id` (origem), `name`, `slug`, `visibility` (`organisation`/`restricted`), `enabled`, `allow_public_links`, `allow_writes` | Soft delete |
| `library_roots` | `library_id`, `drive_id`, `root_item_id`, `root_path` | Único por `(drive_id, root_item_id)`. Várias raízes por biblioteca; a raiz mais próxima ganha |
| `library_access` | `library_id`, `principal_type` (`user`/`group`), `principal_id` (oid Entra), `role` | |

### Media

`media`: uma linha por ficheiro de imagem/vídeo **dentro de um drive conhecido**.

| Coluna | Origem |
|---|---|
| `drive_id` + `item_id` | **Identidade** (única). Renomear/mover nunca cria duplicados |
| `library_id` | Calculado pela árvore de pastas (null se fora de âmbito) |
| `parent_item_id`, `name`, `folder_path` | driveItem; `folder_path` desnormalizado e recalculado em moves |
| `media_type`, `mime_type`, `size`, `width`, `height`, `duration_ms` | Facets `file`, `image`, `video` |
| `taken_at` | Facet `photo.takenDateTime` ou EXIF |
| `source_created_at`, `source_modified_at` | `fileSystemInfo` |
| `sort_at` | `taken_at ?? source_created_at`, calculado pela aplicação (portável e indexável) |
| `latitude`, `longitude`, `place_name`, `place_region`, `place_country`, `place_distance_km` | Facet `location` / EXIF (JPEG e HEIC) + geocodificação offline (GeoNames). `place_distance_km` nulo = dentro da localidade; > 0 = "perto de" |
| `location_source`, `location_set_by` | `graph`, `exif`, `estimated` (fotografia próxima no tempo), `manual` |
| `checksum` | `quickXorHash` (futura detecção de duplicados) |
| `etag`, `ctag` | Detecção de alterações: um cTag diferente significa conteúdo novo (invalida miniaturas e EXIF) |
| `metadata` (JSON) | Câmara, lente, ISO, abertura, exposição… **apenas metadados originais** |
| `source_state` | `active`, `removed_at_source`, `out_of_scope` |
| `hidden_at`, `hidden_by` | Lixo da aplicação (reversível) |
| `last_seen_sync_job_id` | Marca-e-varre nas sincronizações completas |
| `metadata_extracted` | O EXIF já foi lido |

`download_url` e `thumbnail_url` **não** são guardados: são URLs pré-autenticados que expiram.
Ficam em Redis (10 min) ou são obtidos no momento.

| Tabela | Notas |
|---|---|
| `user_media` | `(user_id, media_id)`, `is_favourite`, `favourited_at`: favoritos **pessoais** |
| `tags`, `media_tags` | `source` = `user` ou `ai` (+ `confidence`): IA claramente separada |
| `media_analysis` | `provider`, `analysis_type`, `model_version`, `status`, `result` (JSON), `cost_units` |

### Álbuns e partilha

| Tabela | Notas |
|---|---|
| `albums` | `owner_id`, `name`, `description`, `cover_media_id`, `visibility` (`private`/`organisation`), soft delete |
| `album_media` | `(album_id, media_id)`, `position`, `added_by`, `added_at`. Referências, nunca cópias |
| `shares` | `token_hash` (SHA-256, único), `shareable_type` (`album`/`media`), `album_id`, `audience`, `password_hash`, `expires_at`, `revoked_at`, `view_count` |
| `share_media`, `share_recipients` | Itens e destinatários |

### Operação

| Tabela | Notas |
|---|---|
| `sync_jobs` | `type` (`initial`/`incremental`/`full_resync`), `status`, contadores, `total_estimate` |
| `sync_logs` | `level`, `code`, `message`, `item_id`, `context`. Retenção: 90 dias |
| `audit_logs` | `user_id`, `action`, `subject_type/id`, `ip`, `result`, `context`. Retenção: 365 dias |
| `geo_places` | Localidades GeoNames (id, nome, país, região, lat/lng, população, código). Índice (latitude, longitude). ~184 mil linhas |
| `settings` | `public_links_enabled`, `max_share_days`, `ai_enabled`, `faces_enabled`, `gps_precision` |
| `jobs`, `failed_jobs`, `cache` | Laravel (usados se não houver Redis) |

## Índices e desempenho

| Índice | Uso |
|---|---|
| `media (library_id, source_state, hidden_at, sort_at, id)` | Timeline por biblioteca (keyset) |
| `media (source_state, hidden_at, sort_at, id)` | Timeline com várias bibliotecas |
| `media (drive_id, item_id)` único | Upsert da sincronização |
| `media (drive_id, parent_item_id)` | Recalcular sub-árvores após moves |
| `media FULLTEXT (name, folder_path)` | Pesquisa (só MySQL) |
| `media (mime_type)`, `(checksum)`, `(place_name)`, `(taken_at)` | Filtros, duplicados, locais |
| `user_media (user_id, is_favourite)` | Favoritos |
| `audit_logs (created_at, id)`, `(action, created_at)` | Painel de auditoria |

- **Paginação por cursor (keyset)** em `(sort_at DESC, id DESC)`: custo constante em qualquer página, mesmo com 100k+ itens.
  O cursor é opaco (`base64url([sort_at, id])`) e é validado.
- Contagens por mês (`/timeline/buckets`) ficam em cache 60 s, com invalidação por versão.
- A sincronização faz upserts em lotes de 200 e percorre `drive_folders` com `lazyById`.
- Não há `SELECT *` sem limite sobre `media`.
