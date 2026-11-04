import type {LogEntryDetail, LogRow} from "wordgard-devtools"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export type LogView = {
  rows: LogRow[]
  start: number
  end: number
  /** Rows from this index on may still change: refetched on each load. */
  pending: number
  recording: boolean
  size: number
  loaded: boolean
  error: string | null
}

export type EntryDetail = {entry: LogEntryDetail; error?: undefined} | {entry?: undefined; error: string}

export type LogSource = {
  get: () => LogView
  subscribe: (listener: () => void) => () => void
  /** Fetches the rows appended or changed since the last load. Never rejects. */
  load: () => Promise<void>
  record: (on: boolean) => Promise<void>
  clear: () => Promise<void>
  /** A promise per entry and flush (its timing arrives with the flush), cached: for `use()`. */
  detail: (index: number, flush: number | null) => Promise<EntryDetail>
  /** Drops a cached detail (a failed one, to retry). */
  forget: (index: number, flush: number | null) => void
}

const empty: LogView = {rows: [], start: 0, end: 0, pending: 0, recording: false, size: 0, loaded: false, error: null}
const KEPT = 32

export const createLogSource = (transport: Transport, id: number): LogSource => {
  let view = empty
  let version = 0
  const listeners = new Set<() => void>()
  const set = (patch: Partial<LogView>) => {
    view = {...view, ...patch}
    for (const listener of listeners) listener()
  }

  const details = new Map<string, Promise<EntryDetail>>()

  const load = async (): Promise<void> => {
    const at = ++version
    // Settled rows are kept; the rest (new, or waiting for their flush) is fetched.
    const from = Math.min(view.pending, view.end)
    try {
      const slice = await transport.send({type: "log", id, from, to: Number.MAX_SAFE_INTEGER})
      if (at != version) return
      // A new log (the editor reconnected): start over.
      if (slice.end < view.end) {
        view = empty
        details.clear()
        return load()
      }
      const kept = view.rows.filter(row => row.index >= slice.start && row.index < from)
      const {start, end, pending, recording, size} = slice
      set({rows: [...kept, ...slice.rows], start, end, pending, recording, size, loaded: true, error: null})
    } catch (e) {
      if (at == version) set({error: errorMessage(e)})
    }
  }

  const act = async (send: () => Promise<unknown>) => {
    try {
      await send()
    } catch (e) {
      set({error: errorMessage(e)})
      return
    }
    await load()
  }

  return {
    get: () => view,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    load,
    record: on => act(() => transport.send({type: "record", id, on})),
    clear: () => act(() => transport.send({type: "clear", id})),
    forget: (index, flush) => {
      details.delete(`${index}|${flush}`)
    },
    detail: (index, flush) => {
      const key = `${index}|${flush}`
      let found = details.get(key)
      if (!found) {
        found = transport.send({type: "entry", id, index}).then(
          (entry): EntryDetail => ({entry}),
          (e): EntryDetail => ({error: errorMessage(e)}),
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
