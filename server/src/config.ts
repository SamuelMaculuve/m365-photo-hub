/** Configuração lida das variáveis de ambiente (Netlify: Site configuration → Environment variables). */
const env = (key: string, fallback = ''): string => process.env[key] ?? fallback
const bool = (key: string, fallback = false): boolean => {
  const v = process.env[key]
  return v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}
const int = (key: string, fallback: number): number => {
  const n = Number(process.env[key])
  return Number.isFinite(n) && process.env[key] !== '' && process.env[key] !== undefined ? n : fallback
}

export const config = {
  get appName() { return env('APP_NAME', 'Fotos da Organização') },
  /** Chave de 32 bytes em base64 (cifra tokens e assina URLs). Gerar com: openssl rand -base64 32 */
  get appKey() { return env('APP_KEY') },
  get appUrl() { return env('APP_URL', env('URL', 'http://localhost:5173')).replace(/\/$/, '') },
  get isProduction() { return env('CONTEXT') === 'production' || env('NODE_ENV') === 'production' },
  get isLocal() { return env('APP_ENV', 'local') === 'local' && !this.isProduction },
  get debug() { return bool('APP_DEBUG', false) },
  get devLogin() { return bool('AUTH_DEV_LOGIN', false) },
  get frontendUrl() { return env('FRONTEND_URL', '/') },

  microsoft: {
    get tenantId() { return env('MICROSOFT_TENANT_ID') },
    get clientId() { return env('MICROSOFT_CLIENT_ID') },
    get clientSecret() { return env('MICROSOFT_CLIENT_SECRET') },
    get redirectUri() { return env('MICROSOFT_REDIRECT_URI') },
    get authority() { return env('MICROSOFT_AUTHORITY', 'https://login.microsoftonline.com').replace(/\/$/, '') },
    get graphBaseUrl() { return `${env('MICROSOFT_GRAPH_BASE_URL', 'https://graph.microsoft.com').replace(/\/$/, '')}/v1.0` },
    /** Permissões delegadas pedidas no login (menor privilégio). */
    get delegatedScopes(): string[] {
      return [
        'openid', 'profile', 'email', 'offline_access', 'User.Read',
        ...(bool('MICROSOFT_PERSONAL_ONEDRIVE') ? ['Files.Read'] : []),
        bool('MICROSOFT_ENABLE_WRITES') ? 'Files.ReadWrite.All' : 'Files.Read.All',
      ]
    },
    appScope: 'https://graph.microsoft.com/.default',
    get bootstrapSuperAdmins(): string[] {
      return env('MICROSOFT_BOOTSTRAP_SUPER_ADMINS').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
    },
    get timeoutMs() { return int('MICROSOFT_GRAPH_TIMEOUT', 30) * 1000 },
    get maxRetries() { return int('MICROSOFT_GRAPH_MAX_RETRIES', 5) },
    get userAgent() { return env('MICROSOFT_GRAPH_USER_AGENT', 'NONISV|Organisation|OrganisationPhotos/1.0') },
    deltaSelect: 'id,name,parentReference,file,folder,root,deleted,size,webUrl,eTag,cTag,fileSystemInfo,image,photo,video,location',
  },

  media: {
    image: {
      extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'],
      mime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'],
    },
    video: {
      extensions: ['mp4', 'mov', 'm4v', 'webm'],
      mime: ['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'],
    },
  },

  /** Tamanho lógico da aplicação => tamanho de miniatura do Microsoft Graph. */
  thumbnailSizes: { small: 'small', medium: 'c320x320', large: 'large', xlarge: 'c2048x2048' } as Record<string, string>,
  get thumbnailMaxAgeDays() { return int('THUMBNAIL_CACHE_DAYS', 30) },
  /** Validade em cache dos URLs temporários de download do Microsoft 365 (expiram ~1h). */
  downloadUrlTtl: 600,

  sync: {
    get intervalMinutes() { return int('SYNC_INTERVAL_MINUTES', 10) },
    /** Tempo máximo de trabalho por invocação; o resto continua na seguinte a partir do checkpoint. */
    get sliceSeconds() { return int('SYNC_SLICE_SECONDS', 20) },
  },

  session: {
    cookie: 'm365_session',
    get lifetimeMinutes() { return int('SESSION_LIFETIME', 480) },
  },

  get anonymiseIp() { return bool('AUDIT_ANONYMISE_IP', false) },

  settingsDefaults: {
    public_links_enabled: false,
    max_share_days: 90,
    ai_enabled: false,
    faces_enabled: false,
    gps_precision: 'exact', // exact | city | hidden
  } as Record<string, unknown>,
}

export type ThumbnailSize = 'small' | 'medium' | 'large' | 'xlarge'
