import type { Node as DocNode, Plot, Pos, Slice, Token } from "wordgard/doc";
import * as wordgardDoc from "wordgard/doc";
import type { GardSelection, GardState } from "wordgard/state";
import * as wordgardState from "wordgard/state";
import type {
  CellsInfo,
  EditorInfo,
  MarkPreview,
  NodeDetail,
  Path,
  ResolvedPos,
  SelectionDetail,
  SelectionInfo,
  SliceInfo,
  SliceToken,
  StructureNode,
  TreeNode,
} from "./protocol.ts";
import type { Entry } from "./registry.ts";

export const PREVIEW_LENGTH = 80;
const DEPTH = 6;
/** Nodes longer than this (in positions) don't send their JSON. */
export const JSON_LIMIT = 10_000;

export const truncate = (text: string, max = PREVIEW_LENGTH) =>
  text.length > max ? text.slice(0, max - 1) + "…" : text;

const hasToJSON = (value: object): value is { toJSON: () => unknown } =>
  "toJSON" in value && typeof value.toJSON == "function";

const tryToJSON = (value: {
  toJSON: () => unknown;
}): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: value.toJSON() };
  } catch {
    return { ok: false };
  }
};

/** A structured-cloneable copy of a value, with depth and cycle limits. */
export const toSafe = (value: unknown, depth = DEPTH, seen = new Set<object>()): unknown => {
  if (typeof value == "bigint") return `${value}n`;
  if (typeof value == "symbol") return value.toString();
  if (typeof value == "function") return `[Function ${value.name || "anonymous"}]`;
  if (typeof value != "object" || value == null) return value;
  if (seen.has(value)) return "[Circular]";
  // `Node` is undefined outside a browser (a repro script in Node).
  if (typeof Node != "undefined" && value instanceof Node) return `[${value.nodeName}]`;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (ArrayBuffer.isView(value)) return `[${value.constructor.name}(${value.byteLength} bytes)]`;
  if (depth <= 0) return Array.isArray(value) ? `[Array(${value.length})]` : "[Object]";
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => toSafe(v, depth - 1, seen));
    if (value instanceof Map)
      return { "[Map]": [...value].map((entry) => toSafe(entry, depth - 1, seen)) };
    if (value instanceof Set) return { "[Set]": [...value].map((v) => toSafe(v, depth - 1, seen)) };
    // Wordgard nodes and marks, dates. Some toJSON methods need arguments (a state): then the object's own properties.
    if (hasToJSON(value)) {
      const json = tryToJSON(value);
      if (json.ok) return toSafe(json.value, depth, seen);
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) out[key] = toSafe(v, depth - 1, seen);
    return out;
  } finally {
    seen.delete(value);
  }
};

export const preview = (value: unknown): string | null => {
  if (value == null) return null;
  return truncate(JSON.stringify(toSafe(value, 3)) ?? String(value));
};

/**
 * `GardState.toJSON`, with the fields named by `wordgardDevtools({fields})` added one at a time:
 * Wordgard's throws for a field whose spec has no `toJSON`, which is left out.
 */
/** Where a node breaks its schema's content or mark rules, or null. Parsing checks content too;
 * this also covers marks, and Wordgard versions whose parsing checks less. */
const broken = (schema: GardState["schema"], node: DocNode, path: Path): string | null => {
  const at = path.length ? ` at [${path.join(", ")}]` : "";
  for (const mark of node.marks) {
    if (!schema.markAllowed(mark.type, node.type))
      return `${node.name}${at} can't have the ${mark.type.name} mark`;
  }
  if (!node.isPlot) return null;
  for (const [index, child] of node.content.entries()) {
    if (!schema.canContain(node.type, child.type))
      return `${node.name}${at} can't contain ${child.name}`;
    const found = broken(schema, child, [...path, index]);
    if (found) return found;
  }
  return null;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Replaces the document and selection with a state's JSON, checked against the editor's schema first. */
export const replaceState = ({ wg }: Entry, json: unknown): { exact: boolean } => {
  const fail = (why: string): never => {
    console.error(`[wordgard-devtools] Couldn't replace the state: ${why}`, json);
    throw new Error(why);
  };
  let parsed: GardState | null = null;
  try {
    parsed = wordgardState.GardState.fromJSON(json, wg.state.config.base);
  } catch (e) {
    fail(`not a state of this editor's schema: ${message(e)}`);
  }
  if (!parsed) return fail("not a state");
  const { schema } = wg.state;
  // Node types are compared by identity: the JSON's must be this schema's.
  if (parsed.schema != schema) fail("its schema isn't the editor's");
  const problem = broken(schema, parsed.doc, []);
  if (problem) fail(problem);
  const { doc } = parsed;
  wg.dispatch({
    changes: { from: 0, to: wg.state.doc.contentLength, insert: doc.slice(0, doc.contentLength) },
    selection: parsed.selection,
    userEvent: "devtools.replace",
  });
  return { exact: wg.state.doc.eq(doc) };
};

export const stateJSON = ({ wg, fields = {} }: Entry): unknown => {
  const { state } = wg;
  const json: Record<string, unknown> = { ...state.toJSON() };
  for (const [name, field] of Object.entries(fields)) {
    try {
      const one: unknown = state.toJSON({ [name]: field });
      if (typeof one == "object" && one != null && name in one) json[name] = Reflect.get(one, name);
    } catch {
      // No toJSON in its spec.
    }
  }
  return toSafe(json, 256);
};

export const editorInfo = ({ id, name, attached, recording }: Entry): EditorInfo => ({
  id,
  name,
  attached,
  recording,
});

// The document's content starts at 0, a plot's after its opening token.
const contentStart = (path: Path, from: number) => (path.length ? from + 1 : 0);

/** The node at `path`, with the position before it. */
export const locate = (doc: Plot.Doc, path: Path): { node: DocNode; from: number } | null => {
  let node: DocNode = doc;
  let from = 0;
  for (const [depth, index] of path.entries()) {
    if (!node.isPlot) return null;
    const child: DocNode | undefined = node.content[index];
    if (!child) return null;
    const start = contentStart(path.slice(0, depth), from);
    from = node.content.slice(0, index).reduce((pos, c) => pos + c.length, start);
    node = child;
  }
  return { node, from };
};

const textOf = (node: DocNode): string | null => {
  if (node.isText) return typeof node.param == "string" ? node.param : null;
  if (node.isPlot && node.isTextblock) return node.textContent({ to: PREVIEW_LENGTH + 1 });
  return null;
};

export const treeNode = (node: DocNode, path: Path, from: number): TreeNode => {
  const text = textOf(node);
  return {
    path,
    name: node.name,
    from,
    to: from + node.length,
    childCount: node.isPlot ? node.content.length : 0,
    marks: node.marks.map((mark) => ({ name: mark.name, preview: preview(mark.value) })),
    paramPreview: node.isText ? null : preview(node.tag.param),
    textPreview: text == null ? null : truncate(text),
  };
};

const nest = (node: DocNode, path: Path, from: number): StructureNode => {
  let pos = contentStart(path, from);
  const text = node.isText && typeof node.param == "string" ? { text: node.param } : {};
  return {
    ...treeNode(node, path, from),
    ...text,
    children: node.isPlot
      ? node.content.map((child, index) => {
          const at = pos;
          pos += child.length;
          return nest(child, [...path, index], at);
        })
      : [],
  };
};

/** Every node, nested. Developers' documents: no paging. */
export const structure = (doc: Plot.Doc): StructureNode => nest(doc, [], 0);

export const node = (doc: Plot.Doc, path: Path): NodeDetail => {
  const found = locate(doc, path);
  if (!found) throw new Error(`No node at path [${path.join(", ")}]`);
  const { node, from } = found;
  return {
    ...treeNode(node, path, from),
    param: toSafe(node.tag.param),
    markValues: node.marks.map((mark) => ({ name: mark.name, value: toSafe(mark.value) })),
    text: node.isText && typeof node.param == "string" ? node.param : null,
    // Each nesting level is an object and its content array.
    json: node.length <= JSON_LIMIT ? toSafe(node.toJSON(), 128) : null,
  };
};

/** The path of the node starting at `pos`. */
export const pathFrom = (doc: Plot.Doc, pos: number): Path => [
  ...pathAt(doc, pos),
  doc.resolve(pos).index,
];

/** The innermost node holding `pos`: its plot, or the text leaf it falls in. */
export const pathAt = (doc: Plot.Doc, pos: number): Path => {
  const resolved = doc.resolve(pos);
  const path: number[] = [];
  let plot = resolved.parent;
  while (plot.parent) {
    path.unshift(plot.index);
    plot = plot.parent;
  }
  if (resolved.inText) path.push(resolved.index);
  return path;
};

// By shape, not `instanceof`: importing `wordgard/table` would bundle it into every page.
const cellsOf = (doc: Plot.Doc, sel: GardSelection): CellsInfo | null => {
  if (!("anchorCell" in sel) || !("headCell" in sel)) return null;
  const { anchorCell, headCell } = sel;
  if (typeof anchorCell != "number" || typeof headCell != "number") return null;
  return {
    anchorCell,
    anchorCellPath: pathFrom(doc, anchorCell),
    headCell,
    headCellPath: pathFrom(doc, headCell),
    // Each range is a cell's content: the cell starts just before it.
    paths: sel.ranges.map(({ from }) => pathFrom(doc, from - 1)),
  };
};

export const selection = (state: GardState): SelectionInfo => {
  const { anchor, head, from, to, empty } = state.selection;
  return {
    anchor,
    head,
    from,
    to,
    empty,
    json: toSafe(state.selection.toJSON(state)),
    headPath: pathAt(state.doc, head),
    anchorPath: pathAt(state.doc, anchor),
    nodePath:
      state.selection instanceof wordgardState.GardSelection.Node
        ? pathFrom(state.doc, from)
        : null,
    cells: cellsOf(state.doc, state.selection),
    activeMarks: markPreviews(state.sel.activeMarks),
    storedMarks:
      state.selection instanceof wordgardState.GardSelection.Text && state.selection.marks != null,
  };
};

const plotPath = (plot: Pos.Plot) => {
  const path: number[] = [];
  for (let p = plot; p.parent; p = p.parent) path.unshift(p.index);
  return path;
};

const treeAt = (doc: Plot.Doc, path: Path): TreeNode => {
  const found = locate(doc, path);
  if (!found) throw new Error(`No node at path [${path.join(", ")}]`);
  return treeNode(found.node, path, found.from);
};

const markPreviews = (marks: readonly { name: string; value: unknown }[]): MarkPreview[] =>
  marks.map((mark) => ({ name: mark.name, preview: preview(mark.value) }));

const sliceText = (node: DocNode | null) =>
  node?.isText && typeof node.param == "string" ? node.param : null;

/** Truncated at the start: the end is what's next to the position. */
const truncateStart = (text: string, max = PREVIEW_LENGTH) =>
  text.length > max ? "…" + text.slice(text.length - max + 1) : text;

/** `doc.resolve(pos)`, with errors that say what's wrong with `pos`. */
export const resolvePos = (doc: Plot.Doc, pos: number) => {
  if (!Number.isInteger(pos))
    throw new Error(`${pos} isn't a position: positions are whole numbers`);
  if (pos < 0 || pos > doc.length)
    throw new Error(`Position ${pos} is outside the document (0–${doc.length})`);
  return doc.resolve(pos);
};

export const resolve = (doc: Plot.Doc, pos: number): ResolvedPos => {
  const resolved = resolvePos(doc, pos);
  const { parent, index, inText } = resolved;
  const parentPath = plotPath(parent);
  const child = (at: number) =>
    at >= 0 && at < parent.node.content.length ? treeAt(doc, [...parentPath, at]) : null;
  const textblock = resolved.textblockParent;
  return {
    pos,
    depth: resolved.depth,
    parent: treeAt(doc, parentPath),
    index,
    inText,
    nodeBefore: child(inText ? index : index - 1),
    nodeAfter: child(index),
    textBefore: inText ? truncateStart(sliceText(resolved.nodeBefore) ?? "") : null,
    textAfter: inText ? truncate(sliceText(resolved.nodeAfter) ?? "") : null,
    textblock: textblock ? treeAt(doc, plotPath(textblock)) : null,
    atStart: resolved.isAtStart(parent),
    atEnd: resolved.isAtEnd(parent),
    marks: markPreviews(resolved.marks()),
  };
};

/** Tokens a slice sends. */
export const SLICE_TOKENS = 200;

const sliceToken = (token: Token): SliceToken =>
  token.tokenType == wordgardDoc.Token.Type.Open
    ? { kind: "open", name: token.name }
    : token.tokenType == wordgardDoc.Token.Type.Close
      ? { kind: "close" }
      : {
          kind: "node",
          name: token.name,
          text: textOf(token),
          marks: token.marks.map((mark) => mark.name),
        };

const sliceInfo = (slice: Slice): SliceInfo => ({
  length: slice.length,
  text: truncate(slice.textContent()),
  tokens: slice.content.slice(0, SLICE_TOKENS).map(sliceToken),
  more: Math.max(0, slice.content.length - SLICE_TOKENS),
  context: slice.context.map((tag) => tag.name),
  json:
    slice.length <= JSON_LIMIT
      ? toSafe(
          slice.content.map((token) => token.toJSON()),
          128
        )
      : null,
});

export const selectionDetail = (state: GardState): SelectionDetail => ({
  anchor: resolve(state.doc, state.selection.anchor),
  head: resolve(state.doc, state.selection.head),
  slice: sliceInfo(state.selection.toSlice(state.doc)),
  ranges: state.selection.ranges.map(({ from, to }) => ({ from, to })),
  activeMarks: markPreviews(state.sel.activeMarks),
});
