import type {Wordgard} from "wordgard/editor"
import type {GardState, Transaction} from "wordgard/state"
import * as wordgardState from "wordgard/state"
import type {FieldChange, FieldDetail, FieldInfo, FieldsInfo} from "./protocol.ts"
import type {Entry, Registry} from "./registry.ts"
import {preview, toSafe} from "./serialise.ts"

// Loaded with the serialisers, on the first panel request.

/** Changes kept per field. */
export const HISTORY = 50

type Field = GardState.Field<unknown>
type Change = {tr: Transaction; value: unknown}
/** `watching`: the panels (by client) showing the Fields tab. */
type Tracked = {watching: Set<string>; history: Map<Field, Change[]>}

/**
 * The state fields of a configuration, in extension order, found by walking its extensions:
 * arrays, Wordgard's precedence and compartment wrappers (their `inner`; a compartment's current
 * content), objects with an `extension`. Fields that only a facet or another field provides
 * aren't reachable this way.
 */
const findFields = (state: GardState): Field[] => {
  const found: Field[] = []
  const seen = new Set<unknown>()
  const walk = (ext: unknown) => {
    if (typeof ext != "object" || ext == null || seen.has(ext)) return
    seen.add(ext)
    if (ext instanceof wordgardState.GardState.Field) found.push(ext)
    else if (Array.isArray(ext)) ext.forEach(walk)
    else if ("compartment" in ext && ext.compartment instanceof wordgardState.GardState.Compartment) {
      walk(ext.compartment.get(state) ?? ("inner" in ext ? ext.inner : null))
    } else if ("inner" in ext) walk(ext.inner)
    else if ("extension" in ext) walk(ext.extension)
  }
  walk(state.config.base)
  return found
}

const byConfig = new WeakMap<GardState.Configuration, Field[]>()
const fieldsOf = (state: GardState) => {
  let found = byConfig.get(state.config)
  if (!found) {
    found = findFields(state)
    byConfig.set(state.config, found)
  }
  return found
}

export type FieldTracker = {
  /** From the agent's update listener, for attached editors. */
  updated: (entry: Entry, update: Wordgard.Update) => void
  watch: (entry: Entry, client: string, on: boolean) => void
  watching: (entry: Entry, client: string) => boolean
  list: (entry: Entry) => FieldsInfo
  detail: (entry: Entry, index: number) => FieldDetail
  /** Drops the history of editors that left the registry. */
  prune: () => void
}

export const createFieldTracker = (
  registry: Registry,
  /** A transaction's index in the log, when it's there. */
  logIndex: (entry: Entry, tr: Transaction) => number | null,
): FieldTracker => {
  const tracked = new Map<Entry, Tracked>()
  const trackedOf = (entry: Entry) => {
    let found = tracked.get(entry)
    if (!found) {
      found = {watching: new Set(), history: new Map()}
      tracked.set(entry, found)
    }
    return found
  }
  const tracking = (entry: Entry) => entry.recording || (tracked.get(entry)?.watching.size ?? 0) > 0

  const change = (entry: Entry, {tr, value}: Change): FieldChange => ({
    time: tr.annotation(wordgardState.Transaction.time) ?? 0,
    log: logIndex(entry, tr),
    preview: preview(value),
  })

  const info = (entry: Entry, fields: Field[], index: number): FieldInfo => {
    const field = fields[index]
    if (!field) throw new Error(`No field ${index}`)
    const named = Object.entries(entry.fields ?? {}).find(([, f]) => f == field)?.[0]
    const history = tracked.get(entry)?.history.get(field) ?? []
    const last = history.at(-1)
    return {
      index,
      name: named ?? `field #${index + 1}`,
      named: named != null,
      preview: preview(entry.wg.state.field(field, false)),
      changes: history.length,
      last: last ? change(entry, last) : null,
    }
  }

  return {
    updated: (entry, update) => {
      if (!tracking(entry)) return
      const {history} = trackedOf(entry)
      for (const tr of update.transactions) {
        for (const field of fieldsOf(tr.state)) {
          const value = tr.state.field(field, false)
          if (tr.startState.field(field, false) === value) continue
          let changes = history.get(field)
          if (!changes) history.set(field, (changes = []))
          changes.push({tr, value})
          if (changes.length > HISTORY) changes.shift()
        }
      }
    },
    watch: (entry, client, on) => {
      const {watching} = trackedOf(entry)
      if (on) watching.add(client)
      else watching.delete(client)
    },
    watching: (entry, client) => tracked.get(entry)?.watching.has(client) ?? false,
    list: entry => {
      const fields = fieldsOf(entry.wg.state)
      return {tracking: tracking(entry), fields: fields.map((_, index) => info(entry, fields, index))}
    },
    detail: (entry, index) => {
      const fields = fieldsOf(entry.wg.state)
      const base = info(entry, fields, index)
      const field = fields[index]
      const history = (field && tracked.get(entry)?.history.get(field)) || []
      return {
        ...base,
        value: toSafe(field && entry.wg.state.field(field, false)),
        history: history.map(c => change(entry, c)),
      }
    },
    prune: () => {
      for (const entry of tracked.keys()) if (registry.editors.get(entry.wg) != entry) tracked.delete(entry)
    },
  }
}
