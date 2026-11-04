import type {NodeDetail, Path} from "wordgard-devtools"
import {errorMessage} from "./store.ts"
import type {Transport} from "./transport.ts"

export const ROOT = "root"
export const itemId = (path: Path) => (path.length ? path.join(".") : ROOT)
export const pathOf = (id: string): Path => (id == ROOT ? [] : id.split(".").map(Number))
export const parentOf = (id: string) => {
  const path = pathOf(id)
  return path.length ? itemId(path.slice(0, -1)) : null
}

export type Detail = {node: NodeDetail; error?: undefined} | {node?: undefined; error: string}

/** What the node pane reads: details per document version, and that version. */
export type DetailSource = {
  /** A promise per (document version, path), cached: for `use()`. */
  detail: (path: Path, version: number) => Promise<Detail>
  version: () => number
  subscribe: (listener: () => void) => () => void
}

// Detail promises kept: a deferred render may still show an older version's.
const KEPT = 32

export const createDetailCache = (transport: Transport, id: number) => {
  const details = new Map<string, Promise<Detail>>()
  return (path: Path, version: number) => {
    const key = `${version}|${itemId(path)}`
    let found = details.get(key)
    if (!found) {
      found = transport.send({type: "node", id, path}).then(
        (node): Detail => ({node}),
        (e): Detail => ({error: errorMessage(e)}),
      )
      details.set(key, found)
      for (const old of details.keys()) {
        if (details.size <= KEPT) break
        details.delete(old)
      }
    }
    return found
  }
}
