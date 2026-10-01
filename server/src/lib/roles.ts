export const ROLES = ['super_admin', 'photo_admin', 'editor', 'contributor', 'viewer'] as const
export type Role = (typeof ROLES)[number]

const RANK: Record<Role, number> = { super_admin: 50, photo_admin: 40, editor: 30, contributor: 20, viewer: 10 }

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)
export const atLeast = (role: Role, min: Role): boolean => RANK[role] >= RANK[min]
export const maxRole = (...roles: Role[]): Role => roles.reduce<Role>((a, b) => (RANK[b] > RANK[a] ? b : a), 'viewer')

/** Mapeia o valor de uma App Role do Entra ID (claim "roles") para um papel da aplicação. */
export function fromEntraAppRole(value: string): Role | null {
  switch (value.toLowerCase()) {
    case 'photos.superadmin': return 'super_admin'
    case 'photos.admin': return 'photo_admin'
    case 'photos.editor': return 'editor'
    case 'photos.contributor': return 'contributor'
    case 'photos.viewer': return 'viewer'
    default: return null
  }
}
