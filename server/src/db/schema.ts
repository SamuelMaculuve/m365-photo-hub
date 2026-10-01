import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

const id = () => integer().primaryKey().generatedByDefaultAsIdentity()
const ts = (name?: string) => (name ? timestamp(name, { withTimezone: true, mode: 'date' }) : timestamp({ withTimezone: true, mode: 'date' }))
const timestamps = {
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}

// ---------------------------------------------------------------------------
// Identidade e sessão
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: id(),
    // Identidade Microsoft Entra: o "oid" é imutável; email/UPN podem mudar.
    entraOid: varchar('entra_oid', { length: 64 }).unique(),
    tenantId: varchar('tenant_id', { length: 64 }),
    name: varchar({ length: 255 }).notNull(),
    email: varchar({ length: 255 }),
    upn: varchar({ length: 255 }),
    locale: varchar({ length: 5 }).notNull().default('pt'),
    role: varchar({ length: 32 }).notNull().default('viewer'),
    roleSource: varchar('role_source', { length: 16 }).notNull().default('entra'), // entra | local
    groupIds: jsonb('group_ids').$type<string[]>(),
    groupsSyncedAt: ts('groups_synced_at'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: ts('last_login_at'),
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [index('users_email_idx').on(t.email)],
)

/** Sessões do SPA. O id é o SHA-256 do valor do cookie (o valor nunca é guardado). */
export const sessions = pgTable(
  'sessions',
  {
    id: varchar({ length: 64 }).primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    ip: varchar({ length: 45 }),
    userAgent: text('user_agent'),
    expiresAt: ts('expires_at').notNull(),
    lastActivityAt: ts('last_activity_at').notNull().defaultNow(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
)

/** Tokens delegados da Microsoft, cifrados em repouso (AES-256-GCM com APP_KEY). */
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: id(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: varchar({ length: 32 }).notNull().default('microsoft'),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    scopes: text(),
    expiresAt: ts('expires_at'),
    ...timestamps,
  },
  (t) => [uniqueIndex('oauth_tokens_user_provider').on(t.userId, t.provider)],
)

/** Cache e locks partilhados entre invocações (substitui o Redis). */
export const cacheEntries = pgTable(
  'cache_entries',
  {
    key: varchar({ length: 255 }).primaryKey(),
    value: jsonb().notNull(),
    expiresAt: ts('expires_at'),
  },
  (t) => [index('cache_expires_idx').on(t.expiresAt)],
)

// ---------------------------------------------------------------------------
// Armazenamento Microsoft
// ---------------------------------------------------------------------------

export const drives = pgTable('drives', {
  id: id(),
  driveId: varchar('drive_id', { length: 191 }).notNull().unique(),
  driveType: varchar('drive_type', { length: 32 }).notNull(), // personal | business | documentLibrary | demo
  siteId: varchar('site_id', { length: 191 }),
  name: varchar({ length: 255 }).notNull(),
  webUrl: varchar('web_url', { length: 2048 }),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  authMode: varchar('auth_mode', { length: 16 }).notNull().default('app'), // app | delegated
  ...timestamps,
})

export const driveSyncStates = pgTable('drive_sync_states', {
  id: id(),
  driveId: integer('drive_id').notNull().unique().references(() => drives.id, { onDelete: 'cascade' }),
  deltaLink: text('delta_link'),
  resumeLink: text('resume_link'), // checkpoint de uma sincronização interrompida
  status: varchar({ length: 16 }).notNull().default('idle'), // idle | running | failed
  lastStartedAt: ts('last_started_at'),
  lastCompletedAt: ts('last_completed_at'),
  lastError: text('last_error'),
  itemsSeen: bigint('items_seen', { mode: 'number' }).notNull().default(0),
  ...timestamps,
})

export const driveFolders = pgTable(
  'drive_folders',
  {
    id: id(),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 191 }).notNull(),
    parentItemId: varchar('parent_item_id', { length: 191 }),
    name: varchar({ length: 400 }).notNull(),
    isRoot: boolean('is_root').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('drive_folders_drive_item').on(t.driveId, t.itemId), index('drive_folders_parent').on(t.driveId, t.parentItemId)],
)

export const libraries = pgTable('libraries', {
  id: id(),
  name: varchar({ length: 255 }).notNull(),
  slug: varchar({ length: 255 }).notNull().unique(),
  description: text(),
  visibility: varchar({ length: 16 }).notNull().default('restricted'), // organisation | restricted
  enabled: boolean().notNull().default(true),
  allowPublicLinks: boolean('allow_public_links').notNull().default(false),
  allowWrites: boolean('allow_writes').notNull().default(false),
  allowAi: boolean('allow_ai').notNull().default(false),
  allowFaces: boolean('allow_faces').notNull().default(false),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  deletedAt: ts('deleted_at'),
  ...timestamps,
})

export const libraryRoots = pgTable(
  'library_roots',
  {
    id: id(),
    libraryId: integer('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    rootItemId: varchar('root_item_id', { length: 191 }).notNull(),
    rootPath: varchar('root_path', { length: 1024 }),
    ...timestamps,
  },
  (t) => [uniqueIndex('library_roots_drive_item').on(t.driveId, t.rootItemId)],
)

export const libraryAccess = pgTable(
  'library_access',
  {
    id: id(),
    libraryId: integer('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
    principalType: varchar('principal_type', { length: 8 }).notNull(), // user | group
    principalId: varchar('principal_id', { length: 64 }).notNull(), // oid do utilizador ou do grupo Entra
    displayName: varchar('display_name', { length: 255 }),
    role: varchar({ length: 32 }).notNull().default('viewer'),
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

export const media = pgTable(
  'media',
  {
    id: id(),
    libraryId: integer('library_id').references(() => libraries.id, { onDelete: 'set null' }),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 191 }).notNull(),
    parentItemId: varchar('parent_item_id', { length: 191 }),
    name: varchar({ length: 400 }).notNull(),
    folderPath: varchar('folder_path', { length: 1024 }),
    mediaType: varchar('media_type', { length: 8 }).notNull(), // image | video
    mimeType: varchar('mime_type', { length: 100 }),
    size: bigint({ mode: 'number' }).notNull().default(0),
    width: integer(),
    height: integer(),
    durationMs: integer('duration_ms'),
    takenAt: ts('taken_at'),
    sourceCreatedAt: ts('source_created_at'),
    sourceModifiedAt: ts('source_modified_at'),
    // taken_at ?? source_created_at — calculado pela aplicação para ser indexável.
    sortAt: ts('sort_at').notNull(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    placeName: varchar('place_name', { length: 120 }),
    placeRegion: varchar('place_region', { length: 120 }),
    placeCountry: varchar('place_country', { length: 2 }),
    placeDistanceKm: doublePrecision('place_distance_km'),
    locationSource: varchar('location_source', { length: 16 }), // graph | exif | estimated | manual
    locationSetBy: integer('location_set_by').references(() => users.id, { onDelete: 'set null' }),
    checksum: varchar({ length: 64 }),
    etag: varchar({ length: 191 }),
    ctag: varchar({ length: 191 }),
    webUrl: varchar('web_url', { length: 2048 }),
    metadata: jsonb().$type<MediaMetadata>(),
    sourceState: varchar('source_state', { length: 20 }).notNull().default('active'), // active | removed_at_source | out_of_scope
    metadataExtracted: boolean('metadata_extracted').notNull().default(false),
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

export const userMedia = pgTable(
  'user_media',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    isFavourite: boolean('is_favourite').notNull().default(false),
    favouritedAt: ts('favourited_at'),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaId] }), index('user_media_fav').on(t.userId, t.isFavourite)],
)

export const tags = pgTable('tags', {
  id: id(),
  name: varchar({ length: 100 }).notNull(),
  slug: varchar({ length: 120 }).notNull().unique(),
  ...timestamps,
})

export const mediaTags = pgTable(
  'media_tags',
  {
    mediaId: integer('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
    source: varchar({ length: 8 }).notNull().default('user'), // user | ai
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.tagId, t.source] })],
)

// ---------------------------------------------------------------------------
// Álbuns e partilhas
// ---------------------------------------------------------------------------

export const albums = pgTable(
  'albums',
  {
    id: id(),
    ownerId: integer('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    coverMediaId: integer('cover_media_id').references(() => media.id, { onDelete: 'set null' }),
    visibility: varchar({ length: 16 }).notNull().default('private'), // private | organisation
    deletedAt: ts('deleted_at'),
    ...timestamps,
  },
  (t) => [index('albums_owner').on(t.ownerId, t.updatedAt), index('albums_visibility').on(t.visibility, t.updatedAt)],
)

export const albumMedia = pgTable(
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

export const shares = pgTable(
  'shares',
  {
    id: id(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    createdBy: integer('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    shareableType: varchar('shareable_type', { length: 8 }).notNull(), // album | media
    albumId: integer('album_id').references(() => albums.id, { onDelete: 'cascade' }),
    audience: varchar({ length: 16 }).notNull(), // organisation | users | public
    passwordHash: varchar('password_hash', { length: 255 }),
    expiresAt: ts('expires_at'),
    revokedAt: ts('revoked_at'),
    viewCount: integer('view_count').notNull().default(0),
    lastAccessedAt: ts('last_accessed_at'),
    ...timestamps,
  },
  (t) => [index('shares_creator').on(t.createdBy, t.createdAt)],
)

export const shareRecipients = pgTable(
  'share_recipients',
  {
    shareId: integer('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.shareId, t.userId] }), index('share_recipients_user').on(t.userId)],
)

export const shareMedia = pgTable(
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

export const syncJobs = pgTable(
  'sync_jobs',
  {
    id: id(),
    driveId: integer('drive_id').notNull().references(() => drives.id, { onDelete: 'cascade' }),
    libraryId: integer('library_id').references(() => libraries.id, { onDelete: 'set null' }),
    type: varchar({ length: 16 }).notNull(), // initial | incremental | full_resync
    status: varchar({ length: 16 }).notNull().default('queued'), // queued | running | completed | failed
    totalEstimate: bigint('total_estimate', { mode: 'number' }),
    processed: bigint({ mode: 'number' }).notNull().default(0),
    created: bigint({ mode: 'number' }).notNull().default(0),
    updated: bigint({ mode: 'number' }).notNull().default(0),
    removed: bigint({ mode: 'number' }).notNull().default(0),
    errors: bigint({ mode: 'number' }).notNull().default(0),
    triggeredBy: integer('triggered_by').references(() => users.id, { onDelete: 'set null' }),
    // Estado entre invocações (a sincronização corre por partes): ficheiros à espera da pasta-mãe e pastas alteradas.
    state: jsonb().$type<SyncJobState>(),
    attempts: integer().notNull().default(0),
    startedAt: ts('started_at'),
    finishedAt: ts('finished_at'),
    ...timestamps,
  },
  (t) => [index('sync_jobs_status').on(t.status, t.createdAt), index('sync_jobs_drive').on(t.driveId, t.createdAt)],
)

export const syncLogs = pgTable(
  'sync_logs',
  {
    id: id(),
    syncJobId: integer('sync_job_id').references(() => syncJobs.id, { onDelete: 'cascade' }),
    level: varchar({ length: 10 }).notNull(), // info | warning | error
    code: varchar({ length: 64 }).notNull(),
    message: varchar({ length: 1000 }).notNull(),
    itemId: varchar('item_id', { length: 191 }),
    context: jsonb().$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('sync_logs_level').on(t.level, t.createdAt), index('sync_logs_job').on(t.syncJobId)],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar({ length: 64 }).notNull(),
    subjectType: varchar('subject_type', { length: 32 }),
    subjectId: integer('subject_id'),
    ip: varchar({ length: 45 }),
    result: varchar({ length: 16 }).notNull().default('success'), // success | denied | error
    context: jsonb().$type<Record<string, unknown>>(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_created').on(t.createdAt, t.id),
    index('audit_user').on(t.userId, t.createdAt),
    index('audit_action').on(t.action, t.createdAt),
    index('audit_subject').on(t.subjectType, t.subjectId),
  ],
)

export const settings = pgTable('settings', {
  key: varchar({ length: 64 }).primaryKey(),
  value: jsonb(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})


export type User = typeof users.$inferSelect
export type Media = typeof media.$inferSelect
export type Library = typeof libraries.$inferSelect
export type Drive = typeof drives.$inferSelect
export type SyncJob = typeof syncJobs.$inferSelect
export type DriveSyncState = typeof driveSyncStates.$inferSelect
