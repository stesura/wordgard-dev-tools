import type {StructureNode} from "@stesura/wordgard-dev-tools"
import {createDetailCache, type DetailSource} from "./detail-cache.ts"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type StructureSource = DetailSource & {
  doc: () => StructureNode | null
  error: () => string | null
  /** Fetches the whole document; replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>
  /** Resolves once the latest load is in. */
  ready: () => Promise<void>
}

export const createStructureSource = (transport: Transport, id: number): StructureSource => {
  let version = 0
  let doc: StructureNode | null = null
  let error: string | null = null
  const listeners = new Set<() => void>()
  let pending: Promise<void> = Promise.resolve()

  const load = async () => {
    const at = ++version
    try {
      const loaded = await transport.send({type: "structure", id})
      if (at != version) return
      doc = loaded
      error = null
    } catch (e) {
      if (at != version) return
      // The last structure stays up, with the error.
      error = errorMessage(e)
    }
    for (const listener of listeners) listener()
  }

  return {
    doc: () => doc,
    error: () => error,
    load: () => (pending = load()),
    ready: () => pending,
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
