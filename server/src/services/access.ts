import { and, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { Db } from '../db/client'
import { libraries, libraryAccess, media } from '../db/schema'
import type { User } from '../lib/context'
import { atLeast, maxRole, type Role } from '../lib/roles'

/**
 * Autorização de acesso a media. A visibilidade é decidida por biblioteca (grupos/utilizadores do Entra ID).
 * Calculado por pedido (memorizado na instância); nenhuma cache pode contornar esta verificação.
 */
export class Access {
  private memo: Map<number, Promise<Map<number, Role>>> = new Map()

  constructor(private readonly db: Db) {}

  /** library_id => papel efectivo. */
  libraryRoles(user: User): Promise<Map<number, Role>> {
    let p = this.memo.get(user.id)
    if (!p) {
      p = this.compute(user)
      this.memo.set(user.id, p)
    }
    return p
  }

  private async compute(user: User): Promise<Map<number, Role>> {
    const roles = new Map<number, Role>()
    if (!user.isActive) return roles
    const role = user.role as Role
    const libs = await this.db.select({ id: libraries.id, visibility: libraries.visibility }).from(libraries)
      .where(and(eq(libraries.enabled, true), isNull(libraries.deletedAt)))

    if (atLeast(role, 'photo_admin')) {
      for (const l of libs) roles.set(l.id, role)
      return roles
    }

    for (const l of libs) if (l.visibility === 'organisation') roles.set(l.id, maxRole(role, 'viewer'))
    if (!libs.length) return roles

    const principal = principalId(user)
    const groups = user.groupIds ?? []
    const conds: SQL[] = [and(eq(libraryAccess.principalType, 'user'), eq(libraryAccess.principalId, principal))!]
    if (groups.length) conds.push(and(eq(libraryAccess.principalType, 'group'), inArray(libraryAccess.principalId, groups))!)

    const entries = await this.db.select({ libraryId: libraryAccess.libraryId, role: libraryAccess.role }).from(libraryAccess)
      .where(and(inArray(libraryAccess.libraryId, libs.map((l) => l.id)), or(...conds)))
    for (const e of entries) {
      const current = roles.get(e.libraryId) ?? role
      // O papel global de viewer/contributor/editor pode ser elevado por biblioteca.
      roles.set(e.libraryId, maxRole(current, e.role as Role, 'viewer'))
    }
    return roles
  }

  async libraryIds(user: User): Promise<number[]> {
    return [...(await this.libraryRoles(user)).keys()]
  }

  async roleIn(user: User, libraryId: number | null | undefined): Promise<Role | null> {
    return libraryId ? ((await this.libraryRoles(user)).get(libraryId) ?? null) : null
  }

  /** Condição SQL de tudo o que o utilizador pode ver na timeline. */
  async visibleCondition(user: User, inTrash = false): Promise<SQL> {
    const ids = await this.libraryIds(user)
    return and(
      ids.length ? inArray(media.libraryId, ids) : sql`false`,
      eq(media.sourceState, 'active'),
      inTrash ? sql`${media.hiddenAt} is not null` : isNull(media.hiddenAt),
    )!
  }

  async canView(user: User, m: { libraryId: number | null; sourceState: string; hiddenAt: Date | null }): Promise<boolean> {
    const role = await this.roleIn(user, m.libraryId)
    if (!role || m.sourceState !== 'active') return false
    // Itens no lixo só são visíveis a quem os pode gerir.
    return m.hiddenAt === null || atLeast(role, 'editor')
  }

  async hasRoleFor(user: User, m: { libraryId: number | null }, min: Role): Promise<boolean> {
    const role = await this.roleIn(user, m.libraryId)
    return role !== null && atLeast(role, min)
  }

  /** Invalida a memória (quando bibliotecas ou permissões mudam no mesmo pedido). */
  flush(): void {
    this.memo.clear()
  }
}

export const principalId = (user: User) => user.entraOid ?? `local:${user.id}`
