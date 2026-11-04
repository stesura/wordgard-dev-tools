import type {Node as DocNode, Plot} from "wordgard/doc"
import type {GardState} from "wordgard/state"
import type {EditorInfo, NodeDetail, Path, SelectionInfo, TreeNode} from "./protocol.ts"
import type {Entry} from "./registry.ts"

export const PREVIEW_LENGTH = 80
const DEPTH = 6

export const truncate = (text: string, max = PREVIEW_LENGTH) =>
  text.length > max ? text.slice(0, max - 1) + "…" : text

const hasToJSON = (value: object): value is {toJSON: () => unknown} =>
  "toJSON" in value && typeof value.toJSON == "function"

/** A structured-cloneable copy of a value, with depth and cycle limits. */
export const toSafe = (value: unknown, depth = DEPTH, seen = new Set<object>()): unknown => {
  if (typeof value == "bigint") return `${value}n`
  if (typeof value == "symbol") return value.toString()
  if (typeof value == "function") return `[Function ${value.name || "anonymous"}]`
  if (typeof value != "object" || value == null) return value
  if (seen.has(value)) return "[Circular]"
  // `Node` is undefined outside a browser (a repro script in Node).
  if (typeof Node != "undefined" && value instanceof Node) return `[${value.nodeName}]`
  if (value instanceof Error) return {name: value.name, message: value.message}
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name}(${value.byteLength} bytes)]`
  if (depth <= 0) return Array.isArray(value) ? `[Array(${value.length})]` : "[Object]"
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map(v => toSafe(v, depth - 1, seen))
    if (value instanceof Map) return {"[Map]": [...value].map(entry => toSafe(entry, depth - 1, seen))}
    if (value instanceof Set) return {"[Set]": [...value].map(v => toSafe(v, depth - 1, seen))}
    // Wordgard nodes and marks, dates.
    if (hasToJSON(value)) return toSafe(value.toJSON(), depth, seen)
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) out[key] = toSafe(v, depth - 1, seen)
    return out
  } finally {
    seen.delete(value)
  }
}

export const preview = (value: unknown): string | null => {
  if (value == null) return null
  return truncate(JSON.stringify(toSafe(value, 3)) ?? String(value))
}

export const editorInfo = ({id, name, attached, recording}: Entry): EditorInfo => ({id, name, attached, recording})

// The document's content starts at 0, a plot's after its opening token.
const contentStart = (path: Path, from: number) => (path.length ? from + 1 : 0)

/** The node at `path`, with the position before it. */
export const locate = (doc: Plot.Doc, path: Path): {node: DocNode; from: number} | null => {
  let node: DocNode = doc
  let from = 0
  for (const [depth, index] of path.entries()) {
    if (!node.isPlot) return null
    const child: DocNode | undefined = node.content[index]
    if (!child) return null
    const start = contentStart(path.slice(0, depth), from)
    from = node.content.slice(0, index).reduce((pos, c) => pos + c.length, start)
    node = child
  }
  return {node, from}
}

const textOf = (node: DocNode): string | null => {
  if (node.isText) return typeof node.param == "string" ? node.param : null
  if (node.isPlot && node.isTextblock) return node.textContent({to: PREVIEW_LENGTH + 1})
  return null
}

export const treeNode = (node: DocNode, path: Path, from: number): TreeNode => {
  const text = textOf(node)
  return {
    path,
    name: node.name,
    from,
    to: from + node.length,
    childCount: node.isPlot ? node.content.length : 0,
    marks: node.marks.map(mark => ({name: mark.name, preview: preview(mark.value)})),
    paramPreview: node.isText ? null : preview(node.tag.param),
    textPreview: text == null ? null : truncate(text),
  }
}

export const children = (doc: Plot.Doc, path: Path): TreeNode[] | null => {
  const found = locate(doc, path)
  if (!found) return null
  const {node, from} = found
  if (!node.isPlot) return []
  let pos = contentStart(path, from)
  return node.content.map((child, index) => {
    const at = pos
    pos += child.length
    return treeNode(child, [...path, index], at)
  })
}

export const node = (doc: Plot.Doc, path: Path): NodeDetail => {
  const found = locate(doc, path)
  if (!found) throw new Error(`No node at path [${path.join(", ")}]`)
  const {node, from} = found
  return {
    ...treeNode(node, path, from),
    param: toSafe(node.tag.param),
    markValues: node.marks.map(mark => ({name: mark.name, value: toSafe(mark.value)})),
    text: node.isText && typeof node.param == "string" ? node.param : null,
  }
}

/** The innermost node holding `pos`: its plot, or the text leaf it falls in. */
export const pathAt = (doc: Plot.Doc, pos: number): Path => {
  const resolved = doc.resolve(pos)
  const path: number[] = []
  let plot = resolved.parent
  while (plot.parent) {
    path.unshift(plot.index)
    plot = plot.parent
  }
  if (resolved.inText) path.push(resolved.index)
  return path
}

export const selection = (state: GardState): SelectionInfo => {
  const {anchor, head, from, to, empty} = state.selection
  return {
    anchor,
    head,
    from,
    to,
    empty,
    json: toSafe(state.selection.toJSON(state)),
    headPath: pathAt(state.doc, head),
    anchorPath: pathAt(state.doc, anchor),
  }
}
