import type {ViewInfo} from "wordgard-devtools"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type ViewState = {info: ViewInfo | null; error: string | null}

export type ViewSource = {
  get: () => ViewState
  subscribe: (listener: () => void) => () => void
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>
}

export const createViewSource = (transport: Transport, id: number): ViewSource => {
  let state: ViewState = {info: null, error: null}
  let version = 0
  const listeners = new Set<() => void>()
  return {
    get: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: async () => {
      const at = ++version
      try {
        const info = await transport.send({type: "view", id})
        if (at != version) return
        state = {info, error: null}
      } catch (e) {
        if (at != version) return
        // The last view stays up, with the error.
        state = {...state, error: errorMessage(e)}
      }
      for (const listener of listeners) listener()
    },
  }
}
