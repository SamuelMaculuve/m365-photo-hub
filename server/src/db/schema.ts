import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const id = () => integer().primaryKey({ autoIncrement: true })
// Datas em milissegundos desde a época (UTC): ordenáveis, indexáveis e sem ambiguidade de fuso.
const ts = (name: string) => integer(name, { mode: 'timestamp_ms' })
const now = () => new Date()
const timestamps = {
  createdAt: ts('created_at').notNull().$defaultFn(now),
  updatedAt: ts('updated_at').notNull().$defaultFn(now),
}

// ---------------------------------------------------------------------------
// Identidade e sessão
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  'users',
  {
    id: id(),
    // Identidade Microsoft Entra: o "oid" é imutável; email/UPN podem mudar.
    entraOid: text('entra_oid').unique(),
    tenantId: text('tenant_id'),
    name: text().notNull(),
    email: text(),
    upn: text(),
    locale: text().notNull().default('pt'),
    role: text().notNull().default('viewer'),
    roleSource: text('role_source').notNull().default('entra'), // entra | local
    groupIds: text('group_ids', { mode: 'json' }).$type<string[]>(),
    groupsSyncedAt: ts('groups_synced_at'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: ts('last_login_at'),
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [index('users_email_idx').on(t.email)],
)

/** Sessões do SPA. O id é o SHA-256 do valor do cookie (o valor nunca é guardado). */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    ip: text(),
    userAgent: text('user_agent'),
    expiresAt: ts('expires_at').notNull(),
    lastActivityAt: ts('last_activity_at').notNull().$defaultFn(now),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
)

/** Tokens delegados da Microsoft, cifrados em repouso (AES-256-GCM com APP_KEY). */
export const oauthTokens = sqliteTable(
  'oauth_tokens',
  {
    id: id(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text().notNull().default('microsoft'),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    scopes: text(),
    expiresAt: ts('expires_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('oauth_tokens_user_provider').on(t.userId, t.provider)],
)

/** Cache e locks partilhados entre invocações (substitui o Redis). */
export const cacheEntries = sqliteTable(
  'cache_entries',
  {
    key: text().primaryKey(),
    value: text({ mode: 'json' }).notNull(),
    // Contadores de rate limit (incremento atómico sem ler o JSON).
    counter: integer().notNull().default(0),
    expiresAt: ts('expires_at'),
  },
  (t) => [index('cache_expires_idx').on(t.expiresAt)],
)

// ---------------------------------------------------------------------------
// Armazenamento Microsoft
// ---------------------------------------------------------------------------

export const drives = sqliteTable('drives', {
  id: id(),
  driveId: text('drive_id').notNull().unique(),
  driveType: text('drive_type').notNull(), // personal | business | documentLibrary | demo
  siteId: text('site_id'),
  name: text().notNull(),
  webUrl: text('web_url'),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  authMode: text('auth_mode').notNull().default('app'), // app | delegated
  ...timestamps,
})

export const driveSyncStates = sqliteTable('drive_sync_states', {
  id: id(),
  driveId: integer('drive_id').notNull().unique().references(() => drives.id, { onDelete: 'cascade' }),
  deltaLink: text('delta_link'),
  resumeLink: text('resume_link'), // checkpoint de uma sincronização interrompida
  status: text().notNull().default('idle'), // idle | running | failed
  lastStartedAt: ts('last_started_at'),
  lastCompletedAt: ts('last_completed_at'),
  lastError: text('last_error'),
  itemsSeen: integer('items_seen').notNull().default(0),
  ...timestamps,
})

export const driveFolders = sqliteTable(
  'drive_folders',
  {
    id: id(),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    parentItemId: text('parent_item_id'),
    name: text().notNull(),
    isRoot: integer('is_root', { mode: 'boolean' }).notNull().default(false),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('drive_folders_drive_item').on(t.driveId, t.itemId), index('drive_folders_parent').on(t.driveId, t.parentItemId)],
)

export const libraries = sqliteTable('libraries', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  description: text(),
  visibility: text().notNull().default('restricted'), // organisation | restricted
  enabled: integer({ mode: 'boolean' }).notNull().default(true),
  allowPublicLinks: integer('allow_public_links', { mode: 'boolean' }).notNull().default(false),
  allowWrites: integer('allow_writes', { mode: 'boolean' }).notNull().default(false),
  allowAi: integer('allow_ai', { mode: 'boolean' }).notNull().default(false),
  allowFaces: integer('allow_faces', { mode: 'boolean' }).notNull().default(false),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: ts('deleted_at'),
  ...timestamps,
})

export const libraryRoots = sqliteTable(
  'library_roots',
  {
    id: id(),
    libraryId: integer('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    rootItemId: text('root_item_id').notNull(),
    rootPath: text('root_path'),
    ...timestamps,
  },
  (t) => [uniqueIndex('library_roots_drive_item').on(t.driveId, t.rootItemId)],
)

export const libraryAccess = sqliteTable(
  'library_access',
  {
    id: id(),
    libraryId: integer('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    principalType: text('principal_type').notNull(), // user | group
    principalId: text('principal_id').notNull(), // oid do utilizador ou do grupo Entra
    displayName: text('display_name'),
    role: text().notNull().default('viewer'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('library_access_unique').on(t.libraryId, t.principalType, t.principalId),
    index('library_access_principal').on(t.principalType, t.principalId),
  ],
)

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export type MediaMetadata = {
  camera_make?: string | null
  camera_model?: string | null
  iso?: number | null
  f_number?: number | null
  exposure_time?: string | null
  focal_length?: number | null
  orientation?: number | null
}

export const media = sqliteTable(
  'media',
  {
    id: id(),
    libraryId: integer('library_id').references(() => libraries.id, { onDelete: 'set null' }),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    parentItemId: text('parent_item_id'),
    name: text().notNull(),
    folderPath: text('folder_path'),
    // Versões sem maiúsculas nem acentos, para a pesquisa ("formacao" encontra "Formação").
    nameFolded: text('name_folded'),
    folderFolded: text('folder_folded'),
    placeFolded: text('place_folded'),
    mediaType: text('media_type').notNull(), // image | video
    mimeType: text('mime_type'),
    size: integer().notNull().default(0),
    width: integer(),
    height: integer(),
    durationMs: integer('duration_ms'),
    takenAt: ts('taken_at'),
    sourceCreatedAt: ts('source_created_at'),
    sourceModifiedAt: ts('source_modified_at'),
    // taken_at ?? source_created_at — calculado pela aplicação para ser indexável.
    sortAt: ts('sort_at').notNull(),
    latitude: real(),
    longitude: real(),
    placeName: text('place_name'),
    placeRegion: text('place_region'),
    placeCountry: text('place_country'),
    placeDistanceKm: real('place_distance_km'),
    locationSource: text('location_source'), // graph | exif | estimated | manual
    locationSetBy: integer('location_set_by').references(() => users.id, { onDelete: 'set null' }),
    checksum: text(),
    etag: text(),
    ctag: text(),
    webUrl: text('web_url'),
    metadata: text({ mode: 'json' }).$type<MediaMetadata>(),
    sourceState: text('source_state').notNull().default('active'), // active | removed_at_source | out_of_scope
    metadataExtracted: integer('metadata_extracted', { mode: 'boolean' }).notNull().default(false),
    lastSeenSyncJobId: integer('last_seen_sync_job_id'),
    hiddenAt: ts('hidden_at'), // lixo da aplicação
    hiddenBy: integer('hidden_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('media_drive_item').on(t.driveId, t.itemId),
    index('media_timeline_library').on(t.libraryId, t.sourceState, t.hiddenAt, t.sortAt, t.id),
    index('media_timeline_global').on(t.sourceState, t.hiddenAt, t.sortAt, t.id),
    index('media_parent').on(t.driveId, t.parentItemId),
    index('media_place').on(t.placeName),
    index('media_checksum').on(t.checksum),
  ],
)

export const userMedia = sqliteTable(
  'user_media',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    isFavourite: integer('is_favourite', { mode: 'boolean' }).notNull().default(false),
    favouritedAt: ts('favourited_at'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaId] }), index('user_media_fav').on(t.userId, t.isFavourite)],
)

export const tags = sqliteTable('tags', {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  ...timestamps,
})

export const mediaTags = sqliteTable(
  'media_tags',
  {
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    source: text().notNull().default('user'), // user | ai
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.tagId, t.source] })],
)

// ---------------------------------------------------------------------------
// Álbuns e partilhas
// ---------------------------------------------------------------------------

export const albums = sqliteTable(
  'albums',
  {
    id: id(),
    ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    nameFolded: text('name_folded'),
    description: text(),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    visibility: text().notNull().default('private'), // private | organisation
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [index('albums_owner').on(t.ownerId, t.updatedAt), index('albums_visibility').on(t.visibility, t.updatedAt)],
)

export const albumMedia = sqliteTable(
  'album_media',
  {
    albumId: integer('album_id').notNull().references(() => albums.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
    addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
    addedAt: ts('added_at'),
  },
  (t) => [primaryKey({ columns: [t.albumId, t.mediaId] }), index('album_media_position').on(t.albumId, t.position), index('album_media_media').on(t.mediaId)],
)

export const shares = sqliteTable(
  'shares',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    shareableType: text('shareable_type').notNull(), // album | media
    albumId: integer('album_id').references(() => albums.id, { onDelete: 'cascade' }),
    audience: text().notNull(), // organisation | users | public
    passwordHash: text('password_hash'),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    viewCount: integer('view_count').notNull().default(0),
    lastAccessedAt: ts('last_accessed_at'),
    ...timestamps,
  },
  (t) => [index('shares_creator').on(t.createdBy, t.createdAt)],
)

export const shareRecipients = sqliteTable(
  'share_recipients',
  {
    shareId: integer('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.shareId, t.userId] }), index('share_recipients_user').on(t.userId)],
)

export const shareMedia = sqliteTable(
  'share_media',
  {
    shareId: integer('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.shareId, t.mediaId] })],
)

// ---------------------------------------------------------------------------
// Sincronização, auditoria e definições
// ---------------------------------------------------------------------------

export interface SyncJobState {
  pending?: { item: Record<string, unknown>; type: 'image' | 'video' }[]
  changedFolders?: string[]
  deletedFolders?: string[]
  fullScan?: boolean
}

export const syncJobs = sqliteTable(
  'sync_jobs',
  {
    id: id(),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    libraryId: integer('library_id').references(() => libraries.id, { onDelete: 'set null' }),
    type: text().notNull(), // initial | incremental | full_resync
    status: text().notNull().default('queued'), // queued | running | completed | failed
    totalEstimate: integer('total_estimate'),
    processed: integer().notNull().default(0),
    created: integer().notNull().default(0),
    updated: integer().notNull().default(0),
    removed: integer().notNull().default(0),
    errors: integer().notNull().default(0),
    triggeredBy: integer('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    // Estado entre invocações (a sincronização corre por partes): ficheiros à espera da pasta-mãe e pastas alteradas.
    state: text({ mode: 'json' }).$type<SyncJobState>(),
    attempts: integer().notNull().default(0),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    ...timestamps,
  },
  (t) => [index('sync_jobs_status').on(t.status, t.createdAt), index('sync_jobs_drive').on(t.driveId, t.createdAt)],
)

export const syncLogs = sqliteTable(
  'sync_logs',
  {
    id: id(),
    syncJobId: integer('sync_job_id').references(() => syncJobs.id, { onDelete: 'cascade' }),
    level: text().notNull(), // info | warning | error
    code: text().notNull(),
    message: text().notNull(),
    itemId: text('item_id'),
    context: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => [index('sync_logs_level').on(t.level, t.createdAt), index('sync_logs_job').on(t.syncJobId)],
)

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: id(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    subjectType: text('subject_type'),
    subjectId: integer('subject_id'),
    ip: text(),
    result: text().notNull().default('success'), // success | denied | error
    context: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().$defaultFn(now),
  },
  (t) => [
    index('audit_created').on(t.createdAt, t.id),
    index('audit_user').on(t.userId, t.createdAt),
    index('audit_action').on(t.action, t.createdAt),
    index('audit_subject').on(t.subjectType, t.subjectId),
  ],
)

export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text({ mode: 'json' }),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})


export type User = typeof users.$inferSelect
export type Media = typeof media.$inferSelect
export type Library = typeof libraries.$inferSelect
export type Drive = typeof drives.$inferSelect
export type SyncJob = typeof syncJobs.$inferSelect
export type Album = typeof albums.$inferSelect
export type Share = typeof shares.$inferSelect
export type DriveSyncState = typeof driveSyncStates.$inferSelect
