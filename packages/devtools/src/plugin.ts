import {Wordgard} from "wordgard/editor"
import {currentRegistry, ensureRegistry, type NamedFields} from "./registry.ts"

export type DevtoolsOptions = {
  /** Shown in the panel's editor picker. Defaults to the editor's `aria-label`, then `editor #n`. */
  name?: string
  /** Names for the editor's state fields in the Fields tab; unnamed ones show as "field #n". */
  fields?: NamedFields
}

// Shared by every plugin of this copy, so the facets dedupe them when an editor has two.
const listeners = [
  Wordgard.updateListener.of(update => {
    const registry = currentRegistry()
    const entry = registry?.editors.get(update.editor)
    if (entry?.attached) registry?.agent?.updated(entry, update)
  }),
  Wordgard.transactionListener.of((transactions, wg) => {
    const registry = currentRegistry()
    const entry = registry?.editors.get(wg)
    if (entry?.recording) registry?.agent?.recorded(entry, transactions)
  }),
]

/** Registers the editor with Wordgard DevTools while it is connected. */
export const wordgardDevtools = (options: DevtoolsOptions = {}) =>
  Wordgard.Plugin.define(
    wg => {
      // Added by a reconfigure while connected: Wordgard calls `connect` before creating the
      // value, so `connect` never runs for this instance.
      if (wg.connected) ensureRegistry()?.register(wg, options.name, options.fields)
      return {
        connect: wg => {
          ensureRegistry()?.register(wg, options.name, options.fields)
        },
        disconnect: wg => {
          currentRegistry()?.unregister(wg)
        },
      }
    },
    () => listeners,
  )
