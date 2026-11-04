import type {FieldDetail, FieldsInfo} from "wordgard-devtools"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type FieldResult = {field: FieldDetail; error?: undefined} | {field?: undefined; error: string}

export type FieldsSource = {
  fields: () => FieldsInfo | null
  error: () => string | null
  /** Bumped by each load: a field's detail is cached per version. */
  version: () => number
  subscribe: (listener: () => void) => () => void
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>
  /** A promise per (version, field), cached: for `use()`. */
  detail: (index: number, version: number) => Promise<FieldResult>
}

// Detail promises kept: a deferred render may still show an older version's.
const KEPT = 32

export const createFieldsSource = (transport: Transport, id: number): FieldsSource => {
  let version = 0
  let fields: FieldsInfo | null = null
  let error: string | null = null
  const listeners = new Set<() => void>()
  const details = new Map<string, Promise<FieldResult>>()

  return {
    fields: () => fields,
    error: () => error,
    version: () => version,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load: async () => {
      const at = ++version
      try {
        const loaded = await transport.send({type: "fields", id})
        if (at != version) return
        fields = loaded
        error = null
      } catch (e) {
        if (at != version) return
        error = errorMessage(e)
      }
      for (const listener of listeners) listener()
    },
    detail: (index, at) => {
      const key = `${at}|${index}`
      let found = details.get(key)
      if (!found) {
        found = transport.send({type: "field", id, index}).then(
          (field): FieldResult => ({field}),
          (e): FieldResult => ({error: errorMessage(e)}),
        )
        details.set(key, found)
        for (const old of details.keys()) {
          if (details.size <= KEPT) break
          details.delete(old)
        }
      }
      return found
    },
  }
}
