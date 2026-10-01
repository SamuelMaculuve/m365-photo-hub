import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { users, type Drive, type User } from '../db/schema'
import { unauthenticated } from '../lib/errors'
import { GraphAuth, type GraphTokenProvider } from '../microsoft/auth'

/** Decide que identidade usar para aceder a um drive. */
export class DriveAuth {
  private readonly auth: GraphAuth

  constructor(private readonly db: Db) {
    this.auth = new GraphAuth(db)
  }

  /** Identidade usada pelo motor de sincronização (sem utilizador presente). */
  async forSync(drive: Drive, fallbackUser?: User | null): Promise<GraphTokenProvider> {
    if (drive.authMode === 'app') return this.auth.forApp()
    const owner = drive.ownerUserId ? (await this.db.select().from(users).where(eq(users.id, drive.ownerUserId)))[0] : null
    const user = owner ?? fallbackUser
    if (!user) throw unauthenticated('Delegated drive has no owner to sync as')
    return this.auth.forUser(user)
  }

  /**
   * Identidade usada para obter conteúdo para um utilizador. Em drives delegados usa-se o token
   * do próprio utilizador, para que o SharePoint aplique as permissões reais do ficheiro.
   */
  forContent(drive: Drive, viewer: User | null): GraphTokenProvider {
    return drive.authMode === 'app' || !viewer ? this.auth.forApp() : this.auth.forUser(viewer)
  }
}
