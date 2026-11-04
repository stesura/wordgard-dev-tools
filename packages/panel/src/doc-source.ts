import type {TreeNode} from "wordgard-devtools"
import {ROOT, createDetailCache, itemId, parentOf, pathOf, type DetailSource} from "./detail-cache.ts"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type DocSource = DetailSource & {
  /** A loaded node: the tree's item data. */
  node: (id: string) => TreeNode | undefined
  /** A level's children ids; requests the level when it isn't loaded (batched, not during render). */
  children: (id: string) => string[]
  loading: (id: string) => boolean
  /** Whether a level is loaded (at the current document version or the one before, while it refreshes). */
  loaded: (id: string) => boolean
  /** Loads levels now (one request), waiting for those already in flight. */
  load: (ids: string[]) => Promise<void>
  /**
   * The document changed: refetches the given levels in one request, then drops every other
   * cached level (they load again when expanded). Resolves with the levels that no longer resolve.
   */
  refresh: (expanded: string[]) => Promise<string[]>
  /** The last failed load, until one succeeds. */
  error: () => string | null
}

type Level = {version: number; nodes: TreeNode[]}
// A failed level isn't requested again by rendering for this long: no retry loop on a page that fails at once.
const RETRY_AFTER = 2000

export const createDocSource = (transport: Transport, id: number): DocSource => {
  let version = 0
  // Each level is tagged with the document version it was loaded at.
  const levels = new Map<string, Level>()
  const loading = new Set<string>()
  const inFlight = new Map<string, Promise<unknown>>()
  // When each level last failed. Cleared by a success, a refresh or `load`.
  const failed = new Map<string, number>()
  let error: string | null = null
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const listener of listeners) listener()
  }

  /**
   * Never rejects. Results for an older version are dropped: the refresh that bumped it refetches.
   * `gone`: the levels that no longer resolve.
   */
  const fetch = (ids: string[]) => {
    const at = version
    for (const level of ids) loading.add(level)
    const run = (async () => {
      try {
        const lists = await transport.send({type: "children", id, paths: ids.map(pathOf)})
        if (at != version) return {ok: true, gone: []}
        error = null
        const gone = ids.flatMap((level, index) => {
          const nodes = lists[index]
          failed.delete(level)
          if (nodes) levels.set(level, {version: at, nodes})
          else levels.delete(level)
          return nodes ? [] : [level]
        })
        return {ok: true, gone}
      } catch (e) {
        if (at == version) {
          error = errorMessage(e)
          for (const level of ids) failed.set(level, Date.now())
        }
        return {ok: false, gone: []}
      } finally {
        if (at == version) {
          for (const level of ids) {
            loading.delete(level)
            inFlight.delete(level)
          }
          emit()
        }
      }
    })()
    for (const level of ids) inFlight.set(level, run)
    return run
  }

  let queue: string[] = []
  const request = (level: string) => {
    const failedAt = failed.get(level)
    if (loading.has(level) || (failedAt != null && Date.now() - failedAt < RETRY_AFTER)) return
    loading.add(level)
    if (!queue.length) setTimeout(() => void fetch(queue.splice(0)))
    queue.push(level)
  }

  return {
    node: item => {
      if (item == ROOT) return undefined
      const parent = parentOf(item)
      const index = pathOf(item).at(-1)
      return parent == null || index == null ? undefined : levels.get(parent)?.nodes[index]
    },
    children: level => {
      const found = levels.get(level)
      if (!found) request(level)
      return found ? found.nodes.map(node => itemId(node.path)) : []
    },
    loading: level => loading.has(level),
    loaded: level => levels.has(level),
    load: async ids => {
      for (const level of ids) failed.delete(level)
      // Queued (not sent yet) levels are fetched here too: a duplicate at worst.
      const missing = ids.filter(level => !levels.has(level) && !inFlight.has(level))
      await Promise.all([...ids.map(level => inFlight.get(level)), missing.length ? fetch(missing) : null])
    },
    refresh: async expanded => {
      version++
      loading.clear()
      failed.clear()
      queue = []
      inFlight.clear()
      const at = version
      const {ok, gone} = await fetch(expanded)
      // A newer refresh owns the cache now. After a failure the old levels stay up, with the error.
      if (at != version || !ok) return []
      // Levels not refetched are stale: dropped, they load again when expanded.
      for (const [level, entry] of levels) if (entry.version < version) levels.delete(level)
      emit()
      return gone
    },
    error: () => error,
    detail: createDetailCache(transport, id),
    version: () => version,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
