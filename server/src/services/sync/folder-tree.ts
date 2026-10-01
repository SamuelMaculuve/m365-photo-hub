const MAX_DEPTH = 256

interface Node { parent: string | null; name: string; root: boolean; deleted: boolean }
export interface Scope { library: number | null; path: string; deleted: boolean }

/**
 * Hierarquia de pastas de um drive, em memória, durante uma sincronização.
 *
 * Necessária porque o delta do OneDrive for Business devolve a pasta movida/renomeada
 * mas não necessariamente todos os descendentes: o caminho e a biblioteca de cada
 * ficheiro são recalculados a partir desta árvore.
 */
export class FolderTree {
  private readonly nodes = new Map<string, Node>()
  private children: Map<string, string[]> | null = null
  private memo = new Map<string, Scope | null>()

  /** libraryRoots: root_item_id => library_id */
  constructor(private readonly libraryRoots: Map<string, number> = new Map()) {}

  load(id: string, parent: string | null, name: string, isRoot: boolean, deleted = false): void {
    this.nodes.set(id, { parent, name, root: isRoot, deleted })
  }

  /** true se a pasta já existia e mudou de pai ou de nome (move/rename). */
  upsert(id: string, parent: string | null, name: string, isRoot: boolean): boolean {
    const old = this.nodes.get(id)
    this.nodes.set(id, { parent, name, root: isRoot, deleted: false })
    const changed = old !== undefined && (old.parent !== parent || old.name !== name || old.deleted)
    if (!old || changed) this.invalidate()
    return changed
  }

  markDeleted(id: string): void {
    const node = this.nodes.get(id)
    if (node) {
      node.deleted = true
      this.invalidate()
    }
  }

  has(id: string): boolean {
    return this.nodes.has(id)
  }

  /** Biblioteca e caminho de uma pasta; null = ascendência ainda desconhecida. */
  resolve(folderId: string | null | undefined): Scope | null {
    if (!folderId || !this.nodes.has(folderId)) return null
    if (this.memo.has(folderId)) return this.memo.get(folderId)!

    const names: string[] = []
    let library: number | null = null
    let deleted = false
    let current = folderId

    for (let depth = 0; depth < MAX_DEPTH; depth++) {
      const node = this.nodes.get(current)
      if (!node) return null // um antepassado ainda não foi recebido
      deleted ||= node.deleted
      if (library === null && this.libraryRoots.has(current)) library = this.libraryRoots.get(current)!
      if (node.root) break
      names.push(node.name)
      if (node.parent === null) break // sem pai conhecido mas também não é raiz: tratar como topo
      current = node.parent
    }

    const result: Scope = { library: deleted ? null : library, path: `/${names.reverse().join('/')}`, deleted }
    this.memo.set(folderId, result)
    return result
  }

  /** Todas as pastas na sub-árvore (inclui as próprias). */
  subtree(ids: Iterable<string>): string[] {
    this.children ??= this.buildChildren()
    const seen = new Set<string>()
    const stack = [...ids]
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      for (const child of this.children.get(id) ?? []) stack.push(child)
    }
    return [...seen]
  }

  get size(): number {
    return this.nodes.size
  }

  private buildChildren(): Map<string, string[]> {
    const children = new Map<string, string[]>()
    for (const [id, node] of this.nodes) {
      if (node.parent !== null) children.set(node.parent, [...(children.get(node.parent) ?? []), id])
    }
    return children
  }

  private invalidate(): void {
    this.memo.clear()
    this.children = null
  }
}
