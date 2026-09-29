import { useCallback, useMemo, useState } from 'react'

export interface Selection {
  ids: ReadonlySet<number>
  count: number
  active: boolean
  isSelected: (id: number) => boolean
  toggle: (id: number) => void
  set: (ids: number[]) => void
  clear: () => void
}

export function useSelection(): Selection {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set())
  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  const set = useCallback((list: number[]) => setIds(new Set(list)), [])
  const clear = useCallback(() => setIds(new Set()), [])
  return useMemo(
    () => ({
      ids,
      count: ids.size,
      active: ids.size > 0,
      isSelected: (id: number) => ids.has(id),
      toggle,
      set,
      clear,
    }),
    [ids, toggle, set, clear],
  )
}
