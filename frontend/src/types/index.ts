// Tipos que espelham os Resources da API (docs/API.md).

export type MediaType = 'image' | 'video'
export type ThumbnailSize = 'small' | 'medium' | 'large' | 'xlarge'
export type Thumbnails = Record<ThumbnailSize, string>

export interface Media {
  id: number
  name: string
  type: MediaType
  mime_type: string
  width: number | null
  height: number | null
  duration_ms: number | null
  taken_at: string | null
  sort_at: string
  size: number
  library_id: number
  is_favourite: boolean
  thumbnails: Thumbnails
  stream_url: string | null
  /** Só presente em itens de partilhas públicas. */
  download_url?: string | null
}

export interface MediaMetadata {
  camera_make?: string | null
  camera_model?: string | null
  iso?: number | null
  f_number?: number | null
  exposure_time?: string | null
  focal_length?: number | null
  orientation?: number | null
  [key: string]: unknown
}

export interface MediaLocation {
  latitude: number
  longitude: number
  place: string | null
}

export interface MediaCan {
  trash: boolean
  restore: boolean
  delete_from_source: boolean
  share: boolean
  add_to_album: boolean
}

export interface MediaDetail extends Media {
  folder_path: string | null
  web_url: string | null
  download_url: string
  source_created_at: string | null
  source_modified_at: string | null
  metadata: MediaMetadata | null
  location: MediaLocation | null
  albums: { id: number; name: string }[]
  tags: { name: string; source: 'user' | 'ai' }[]
  library: { id: number; name: string } | null
  hidden_at: string | null
  can: MediaCan
  /** Metadados gerados por IA (separados dos originais). */
  ai?: MediaAi | null
  /** Pessoas reconhecidas (só com reconhecimento facial activo). */
  people?: MediaPerson[]
}

/** Rosto de uma pessoa numa fotografia; `box` = [x, y, largura, altura] normalizados 0–1. */
export interface MediaPerson {
  id: number
  name: string | null
  face_id: number
  box: [number, number, number, number]
}

export interface MediaAi {
  caption: string | null
  labels: string[]
  text: string | null
  people_count: number | null
  model: string | null
  generated: true
}

export interface CursorMeta {
  next_cursor: string | null
  per_page?: number
  interpreted?: SearchInterpretation
  semantic?: boolean
}

export interface CursorPage<T> {
  data: T[]
  meta: CursorMeta
}

export interface PageMeta {
  current_page: number
  per_page: number
  total: number
  last_page: number
}

export interface Paginated<T> {
  data: T[]
  meta: PageMeta
}

export interface TimelineBucket {
  month: string // "2026-09"
  count: number
}

export interface Album {
  id: number
  name: string
  description: string | null
  visibility: 'private' | 'organisation'
  media_count: number
  cover: Media | null
  owner: { id: number; name: string }
  created_at: string
  updated_at: string
  can: { update: boolean; delete: boolean; share: boolean }
}

export interface AlbumInput {
  name?: string
  description?: string | null
  visibility?: 'private' | 'organisation'
  cover_media_id?: number | null
}

export type Role = 'super_admin' | 'photo_admin' | 'editor' | 'contributor' | 'viewer'

export interface Permissions {
  admin: boolean
  manage_libraries: boolean
  manage_sync: boolean
  manage_users: boolean
  view_audit: boolean
  delete_from_source: boolean
  upload: boolean
}

export interface CurrentUser {
  id: number
  name: string
  email: string
  locale: 'pt' | 'en'
  role: Role
  permissions: Permissions
  libraries: { id: number; name: string; role: string; allow_writes?: boolean }[]
  features?: { semantic_search: boolean; faces?: boolean }
}

export interface UserSummary {
  id: number
  name: string
  email: string
}

export interface AuthConfig {
  dev_login: boolean
  app_name: string
  microsoft_configured?: boolean
}

export interface PhotoFilters {
  type?: MediaType
  library_id?: number
  from?: string
  to?: string
  favourite?: boolean
  place?: string
}

export interface SearchFilters extends PhotoFilters {
  q?: string
  folder?: string
  album_id?: number
  /** Pesquisa por significado (IA). */
  semantic?: boolean
}

export interface SearchInterpretation {
  text?: string | null
  type?: MediaType | null
  from?: string | null
  to?: string | null
  favourite?: boolean | null
}

export interface SearchSuggestions {
  folders: string[]
  albums: { id: number; name: string }[]
  places: string[]
}

export interface Place {
  name: string
  admin1: string | null
  count: number
  latitude: number | null
  longitude: number | null
  cover: Media | null
}

export interface Person {
  id: number
  name: string | null
  face_count: number
  is_hidden: boolean
  /** URL relativo do recorte do rosto (JPEG). */
  thumbnail: string
  can: { update: boolean; suppress: boolean }
}

export interface PersonInput {
  name?: string | null
  is_hidden?: boolean
}

export interface PeopleFilters {
  q?: string
  hidden?: boolean
}

export interface Library {
  id: number
  name: string
  description: string | null
  media_count: number
}

export type BulkAction = 'favorite' | 'unfavorite' | 'trash' | 'restore'

export type ShareAudience = 'organisation' | 'users' | 'public'

export interface ShareInput {
  type: 'album' | 'media'
  album_id?: number
  media_ids?: number[]
  audience: ShareAudience
  user_ids?: number[]
  expires_at?: string | null
  password?: string | null
}

/** Estrutura assumida (a API só define os campos de criação). */
export interface Share {
  id: number
  type: 'album' | 'media'
  audience: ShareAudience
  url: string
  token?: string
  title?: string | null
  expires_at: string | null
  revoked_at?: string | null
  created_at?: string
  view_count?: number
  has_password?: boolean
  owner?: { id: number; name: string } | null
  created_by?: { id: number; name: string } | null
  album_id?: number | null
  media_count?: number | null
}

export interface PublicShare {
  id?: number
  audience?: ShareAudience
  created_by?: { id: number; name: string } | null
  title: string
  type: 'album' | 'media'
  expires_at: string | null
  items: Media[]
}

// --- Administração ---

export type HealthStatus = 'healthy' | 'degraded' | 'error'

export interface AdminDashboard {
  photos: number
  videos: number
  albums: number
  users: number
  storage_bytes: number
  last_sync_at: string | null
  sync_errors_24h: number
  unprocessed: number
  running_jobs: number
  status: HealthStatus
  ai_enabled: boolean
}

export interface FacesStatus {
  enabled: boolean
  available: boolean
  scanned: number
  pending: number
  faces: number
  people: number
}

export interface LibraryRoot {
  id?: number
  drive_id: string
  item_id: string
  path?: string | null
  root_path?: string | null
  drive_name?: string | null
}

export interface AdminLibrary {
  id: number
  name: string
  description: string | null
  visibility: 'organisation' | 'restricted'
  enabled: boolean
  allow_public_links: boolean
  allow_writes: boolean
  allow_ai?: boolean
  allow_faces?: boolean
  media_count?: number
  status?: string | null
  last_sync_at?: string | null
  roots: LibraryRoot[]
}

export interface AdminLibraryInput {
  name: string
  description?: string | null
  visibility: 'organisation' | 'restricted'
  allow_public_links: boolean
  allow_writes: boolean
  allow_ai?: boolean
  allow_faces?: boolean
  enabled?: boolean
  roots: { drive_id: string; item_id: string }[]
}

export interface ValidationCheck {
  key: string
  ok: boolean
  message: string
}

export interface LibraryValidation {
  ok: boolean
  checks: ValidationCheck[]
}

export interface LibraryAccessEntry {
  principal_type: 'user' | 'group'
  principal_id: string
  display_name: string
  role: 'photo_admin' | 'editor' | 'contributor' | 'viewer'
}

export interface GraphSite {
  id: string
  name?: string | null
  display_name?: string | null
  displayName?: string | null
  web_url?: string | null
  webUrl?: string | null
}

export interface GraphDrive {
  id: string
  name: string
  drive_type?: string | null
  web_url?: string | null
}

export interface GraphFolder {
  id: string
  name: string
  child_count?: number | null
  path?: string | null
}

export interface SyncJob {
  id: number
  drive: { id: number; name: string } | null
  type: 'initial' | 'incremental' | 'full_resync' | string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string
  processed: number
  total_estimate: number | null
  created: number
  updated: number
  removed: number
  errors: number
  progress: number | null
  eta_seconds: number | null
  started_at: string | null
  finished_at: string | null
}

export interface SyncDriveStatus {
  id: number
  name: string
  status: string
  last_completed_at: string | null
  last_error: string | null
}

export interface SyncStatus {
  running: SyncJob[]
  drives: SyncDriveStatus[]
}

export interface SyncLog {
  id: number
  level: string
  code: string | null
  message: string
  item_id?: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  user: { id: number; name: string } | null
  action: string
  subject_type: string | null
  subject_id: number | string | null
  result: 'success' | 'denied' | 'error' | string
  ip?: string | null
  context?: Record<string, unknown> | null
  created_at: string
}

export interface AdminUser {
  id: number
  name: string
  email: string
  role: Role
  is_active: boolean
  last_login_at: string | null
}

export interface AdminSettings {
  public_links_enabled: boolean
  max_share_days: number
  ai_enabled: boolean
  faces_enabled: boolean
  gps_precision: number | string
}

export interface AdminError {
  id: number | string
  level?: string
  source?: string | null
  code: string | null
  message: string
  created_at: string
  context?: Record<string, unknown> | null
}

export interface UploadSession {
  upload_url: string
  expires_at: string | null
  chunk_size: number
}
