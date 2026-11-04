// The wire protocol between the panel and the page agent. Everything here is
// structured-cloneable: it crosses `postMessage` in the extension.

export const PROTOCOL = 1
export const SOURCE = "wordgard-devtools"

/** Child indices from the document down to a node. `[]` is the document. */
export type Path = readonly number[]

export type TreeNode = {
  path: Path
  name: string
  /** Position before the node (0 for the document). */
  from: number
  /** Position after the node. */
  to: number
  childCount: number
  marks: {name: string; preview: string | null}[]
  paramPreview: string | null
  /** A text leaf's text, or a textblock's, truncated. */
  textPreview: string | null
}

export type NodeDetail = TreeNode & {
  param: unknown
  markValues: {name: string; value: unknown}[]
  /** A text leaf's full text. */
  text: string | null
}

export type SelectionInfo = {
  anchor: number
  head: number
  from: number
  to: number
  empty: boolean
  /** `GardSelection.toJSON`, which names the selection type. */
  json: unknown
  /** Innermost node holding the head: its plot, or its text leaf. */
  headPath: Path
  anchorPath: Path
}

export type EditorInfo = {
  id: number
  name: string
  attached: boolean
  recording: boolean
  /** The frame it lives in, when not the top one. Set by the extension's transport. */
  frame?: string
}

export type AgentInfo = {version: string; protocol: number}

type Empty = Record<never, never>

export type Requests = {
  listEditors: Empty
  /** Attach the panel to an editor, or detach it with `null`. */
  select: {id: number | null}
  /** The children of each path; `null` for a path that doesn't resolve. */
  children: {id: number; paths: readonly Path[]}
  node: {id: number; path: Path}
  selection: {id: number}
  record: {id: number; on: boolean}
  clear: {id: number}
  log: {id: number; from: number; to: number}
  entry: {id: number; index: number}
  highlight: {id: number; path: Path | null}
  pick: {on: boolean}
  setConsole: {id: number; index?: number}
  repro: {id: number}
}

export type Results = {
  listEditors: {
    /** Null when no frame has a usable agent. */
    agent: AgentInfo | null
    editors: EditorInfo[]
    /** Problems with some frames (a protocol mismatch), for the panel to show. */
    notices?: string[]
  }
  select: null
  children: (TreeNode[] | null)[]
  node: NodeDetail
  selection: SelectionInfo
  record: null
  clear: null
  log: never
  entry: never
  highlight: null
  pick: null
  setConsole: null
  repro: string
}

export type RequestType = keyof Requests

export type Request<K extends RequestType = RequestType> = {[P in K]: {type: P} & Requests[P]}[K]

export type Reply<K extends RequestType = RequestType> =
  | {ok: true; value: Results[K]}
  | {ok: false; error: string}

export type Push =
  | {type: "editorsChanged"}
  | {type: "stateChanged"; id: number; docChanged: boolean; selectionSet: boolean}
  | {type: "picked"; id: number; path: Path}
  | {type: "logAppended"; id: number; count: number}

export type Message =
  | {source: typeof SOURCE; v: number; kind: "request"; id: number; request: Request}
  | {source: typeof SOURCE; v: number; kind: "reply"; id: number; reply: Reply}
  | {source: typeof SOURCE; v: number; kind: "push"; push: Push}
  /** From the agent, when created and when pinged: lets a bridge find it. */
  | {source: typeof SOURCE; v: number; kind: "announce"; agent: AgentInfo}
  | {source: typeof SOURCE; v: number; kind: "ping"}
  /** The extension's panel went away: stop pushing over postMessage, detach editors. */
  | {source: typeof SOURCE; v: number; kind: "detach"}

export const mismatch = (agent: number, panel: number) => `Page agent speaks protocol ${agent}, panel expects ${panel}`
