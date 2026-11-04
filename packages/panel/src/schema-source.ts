import type {SchemaInfo} from "wordgard-devtools"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type SchemaSource = {
  schema: () => SchemaInfo | null
  error: () => string | null
  subscribe: (listener: () => void) => () => void
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>
  /** Resolves once the latest load is in. */
  ready: () => Promise<void>
}

export const createSchemaSource = (transport: Transport, id: number): SchemaSource => {
  let version = 0
  let schema: SchemaInfo | null = null
  let error: string | null = null
  const listeners = new Set<() => void>()
  let pending: Promise<void> = Promise.resolve()

  const load = async () => {
    const at = ++version
    try {
      const loaded = await transport.send({type: "schema", id})
      if (at != version) return
      schema = loaded
      error = null
    } catch (e) {
      if (at != version) return
      // The last schema stays up, with the error.
      error = errorMessage(e)
    }
    for (const listener of listeners) listener()
  }

  return {
    schema: () => schema,
    error: () => error,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: () => (pending = load()),
    ready: () => pending,
  }
}
