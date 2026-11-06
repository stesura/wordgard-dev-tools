import type { Node as DocNode, Plot, Pos } from "wordgard/doc";
import * as wordgardDoc from "wordgard/doc";
import * as wordgardEditor from "wordgard/editor";
import type { GardState } from "wordgard/state";
import type {
  DecorationInfo,
  DecorationKind,
  DecorationSource,
  DecorationsInfo,
  Path,
} from "./protocol.ts";
import { createQueryNamer, isQuery } from "./schema.ts";
import { pathIn, plotPath, preview, truncate } from "./serialise.ts";
import { asSet, walkSet, type SetItem, type TypedSet } from "./sets.ts";

// Loaded with the serialisers, on the first panel request. Decorations' own fields are Wordgard
// internals: each read is guarded, and an unknown one shows as "decoration".

/** Decorations sent per request, all sources together. */
export const DECORATIONS = 2000;
/** Nodes listed per range decoration. */
const PATHS = 50;
/** Wordgard's `Side.After`, the side of a point that applies to the node after it. */
const AFTER = 1e9;
/** Wordgard's `DecorationScope`. */
const SCOPES: [number, string][] = [
  [1, "atom"],
  [2, "inline atom"],
  [4, "all"],
];

export type Source = {
  kind: "point" | "range";
  fn: (state: GardState) => unknown;
  builtIn: boolean;
};

/** Point sources, then range sources. `combine` appends Wordgard's node selection to the points. */
export const sourcesOf = (state: GardState): Source[] => {
  const { Decoration } = wordgardEditor;
  let points: readonly ((state: GardState) => unknown)[];
  let ranges: readonly ((state: GardState) => unknown)[];
  try {
    points = state.facet(Decoration.Point.source);
    ranges = state.facet(Decoration.Range.source);
  } catch {
    // A Wordgard without these facets.
    return [];
  }
  return [
    ...points.map((fn, i): Source => ({ kind: "point", fn, builtIn: i == points.length - 1 })),
    ...ranges.map((fn): Source => ({ kind: "range", fn, builtIn: false })),
  ];
};

export const sourceName = ({ fn, builtIn }: Source) =>
  builtIn ? "node selection" : fn.name || null;

// The decoration classes aren't exported: their constructors, from the public factories.
let classes: Map<unknown, DecorationKind> | null = null;
const classesOf = () =>
  (classes ??= (() => {
    const found = new Map<unknown, DecorationKind>();
    const { Decoration } = wordgardEditor;
    const { Elt } = wordgardDoc;
    const add = (kind: DecorationKind, make: () => object) => {
      try {
        found.set(make().constructor, kind);
      } catch {
        // An older Wordgard: that kind shows as "decoration".
      }
    };
    add("attributes", () => Decoration.Point.attributes({}));
    add("wrapper", () => Decoration.Point.wrapper(Elt.mk("span", [0])));
    add("shape", () => Decoration.Point.shape(Elt.mk("span")));
    add("range attribute", () => Decoration.Range.attribute("x", ""));
    add("range wrapper", () => Decoration.Range.wrapper("span", {}));
    return found;
  })());

const isWidget = (value: unknown): value is wordgardEditor.Widget =>
  typeof wordgardEditor.Widget == "function" && value instanceof wordgardEditor.Widget;

const kindOf = (value: unknown): DecorationKind => {
  if (typeof value != "object" || value == null) return "decoration";
  if ("widget" in value && isWidget(value.widget)) return "widget";
  return classesOf().get(value.constructor) ?? "decoration";
};

const escape = (text: string) => text.replace(/[<&"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Pairs from Wordgard's flat attribute list (`[name, value, …]`). */
const pairs = (attrs: unknown): [string, string][] => {
  if (!Array.isArray(attrs)) return [];
  const found: [string, string][] = [];
  for (let i = 0; i + 1 < attrs.length; i += 2)
    found.push([String(attrs[i]), String(attrs[i + 1])]);
  return found;
};

/**
 * An element as HTML. Not `Elt.toHTML()`, which throws on a widget child: the content hole is
 * "…", a widget "⟨widget⟩".
 */
export const renderElt = (node: unknown, depth = 6): string => {
  if (typeof node == "string") return escape(node);
  if (node === 0) return "…";
  if (isWidget(node)) return "⟨widget⟩";
  if (!(node instanceof wordgardDoc.Elt)) return "?";
  const attrs = pairs(node.attrs)
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join("");
  const inner =
    depth > 0 ? node.children.map((child) => renderElt(child, depth - 1)).join("") : "…";
  return `<${node.tagName}${attrs}>${inner}</${node.tagName}>`;
};

const selectorText = (selector: unknown) => {
  if (typeof selector != "object" || selector == null) return null;
  const tag = "tag" in selector && typeof selector.tag == "string" ? selector.tag : "";
  const classes =
    "classes" in selector && Array.isArray(selector.classes)
      ? selector.classes.map((c) => `.${String(c)}`).join("")
      : "";
  return tag + classes || null;
};

const sideLabel = (side: number) =>
  side >= AFTER ? "after" : side < 0 ? `before (${side})` : side > 0 ? `after (${side})` : "0";

/** What a decoration adds, from its (internal) fields. */
const detailsOf = (
  value: unknown,
  kind: DecorationKind,
  describe: (query: unknown) => string | null
) => {
  const details: [string, string][] = [];
  if (typeof value != "object" || value == null) return details;
  const add = (label: string, text: string | null) => {
    if (text != null) details.push([label, truncate(text, 200)]);
  };
  if (kind == "widget" && "widget" in value && isWidget(value.widget)) {
    const { widget } = value;
    add("param", "value" in widget ? preview(widget.value) : null);
    if ("trackMode" in value)
      add("track", value.trackMode == null ? "never deleted" : String(value.trackMode));
  }
  if ("attrs" in value)
    add(
      "attributes",
      pairs(value.attrs)
        .map(([n, v]) => `${n}="${v}"`)
        .join(" ") || null
    );
  if ("shape" in value) add("shape", isWidget(value.shape) ? "⟨widget⟩" : renderElt(value.shape));
  if ("elt" in value) add(kind == "range wrapper" ? "element" : "wrapper", renderElt(value.elt));
  if ("selector" in value) add("target", selectorText(value.selector));
  if ("attribute" in value && "value" in value)
    add("attribute", `${String(value.attribute)}="${String(value.value)}"`);
  if ("rank" in value && typeof value.rank == "number") add("rank", String(value.rank));
  if ("spanning" in value) add("spanning", String(value.spanning));
  if ("query" in value && value.query != null) add("query", describe(value.query));
  if ("scope" in value && typeof value.scope == "number") {
    const scope = value.scope;
    add(
      "scope",
      SCOPES.filter(([bit]) => scope & bit)
        .map(([, name]) => name)
        .join(", ") || null
    );
  }
  if ("inclusiveStart" in value && "inclusiveEnd" in value) {
    const ends = [value.inclusiveStart && "start", value.inclusiveEnd && "end"].filter(Boolean);
    if (ends.length) add("inclusive", ends.join(", "));
  }
  return details;
};

/** Inside an atom, Wordgard draws no decoration: the atom's own drawing stands. */
const inAtom = (state: GardState, resolved: Pos) => {
  for (let p: Pos.Plot | null = resolved.parent; p?.parent; p = p.parent)
    if (state.isAtom(p.node.type)) return true;
  return false;
};

const resolved = (doc: Plot.Doc, pos: number) =>
  Number.isInteger(pos) && pos >= 0 && pos <= doc.length ? doc.resolve(pos) : null;

/** The node starting at `pos`, as a point decoration finds it: never a text leaf. */
const nodeStartingAt = (at: Pos): Path | null =>
  !at.inText && at.nodeAfter && !at.nodeAfter.isText ? [...plotPath(at.parent), at.index] : null;

/** The nodes a range decoration applies to: those starting in it that its scope and query admit. */
const rangeNodes = (state: GardState, value: object, from: number, to: number): Path[] => {
  const scope = "scope" in value && typeof value.scope == "number" ? value.scope : 1;
  const query = "query" in value && isQuery(value.query) ? value.query : null;
  const found: Path[] = [];
  const { doc } = state;
  doc.iterate(Math.max(0, from), Math.min(to, doc.length), (node: DocNode, pos: number) => {
    if (found.length >= PATHS) return false;
    const atom = state.isAtom(node.type);
    const nodeScope = 4 | (atom ? 1 | (node.type.isInline ? 2 : 0) : 0);
    if (
      pos >= from &&
      pos < to &&
      nodeScope & scope &&
      (!query || state.schema.matchNode(node.type, query))
    ) {
      const at = resolved(doc, pos);
      if (at) found.push([...plotPath(at.parent), at.index]);
    }
    // Wordgard draws nothing inside an atom.
    return !atom;
  });
  return found;
};

export const decorations = (state: GardState): DecorationsInfo => {
  const namer = createQueryNamer(state.schema);
  const describe = (query: unknown) => (isQuery(query) ? namer.describe(query) : null);
  const sources: DecorationSource[] = [];
  const list: DecorationInfo[] = [];
  let room = DECORATIONS;
  sourcesOf(state).forEach((source, index) => {
    let typed: TypedSet | null = null;
    let error: string | null = null;
    try {
      typed = asSet(source.fn(state));
      if (!typed) error = "It didn't return a set";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const walked = typed ? walkSet(typed, room, DECORATIONS * 10) : null;
    sources.push({
      index,
      kind: source.kind,
      name: sourceName(source),
      builtIn: source.builtIn,
      count: walked?.total ?? 0,
      exact: walked?.exact ?? true,
      error,
    });
    if (!walked) return;
    room -= walked.items.length;
    walked.items.forEach((item, i) =>
      list.push(info(state, describe, index, i, source.kind, item))
    );
  });
  noteShapes(list);
  return { sources, decorations: list };
};

const info = (
  state: GardState,
  describe: (query: unknown) => string | null,
  source: number,
  index: number,
  sourceKind: "point" | "range",
  { from, to, side, value }: SetItem
): DecorationInfo => {
  const kind = kindOf(value);
  const at = resolved(state.doc, from);
  const base = {
    source,
    index,
    kind,
    from,
    to,
    side: side == null ? null : sideLabel(side),
    details: detailsOf(value, kind, describe),
    at: pathIn(state.doc, from),
    paths: [],
    offset: null,
    note: at ? null : "outside the document",
  };
  if (!at) return base;
  if (sourceKind == "range") {
    const paths =
      typeof value == "object" && value != null ? rangeNodes(state, value, from, to) : [];
    return {
      ...base,
      paths,
      note: paths.length
        ? null
        : "applies to no node: none starts in it that its scope and query admit",
    };
  }
  if (inAtom(state, at)) return { ...base, note: "inside an atom: not drawn" };
  if (kind == "widget") return { ...base, offset: at.inText || null };
  const path = nodeStartingAt(at);
  if (!path) return { ...base, note: "applies to no node: no node other than text starts here" };
  return { ...base, paths: [path] };
};

/**
 * Several shapes at one position: within a source, Wordgard keeps the first; across sources, the
 * last its cursor yields, which isn't source order.
 */
const noteShapes = (list: DecorationInfo[]) => {
  const byPos = new Map<number, DecorationInfo[]>();
  for (const item of list) {
    if (item.kind != "shape" || !item.paths.length || item.note) continue;
    const group = byPos.get(item.from);
    if (group) group.push(item);
    else byPos.set(item.from, [item]);
  }
  for (const group of byPos.values()) {
    const several = new Set(group.map((item) => item.source)).size > 1;
    const seen = new Set<number>();
    for (const item of group) {
      if (seen.has(item.source)) item.note = "an earlier shape in this source wins";
      else if (several)
        item.note =
          "other sources put a shape here too: Wordgard draws one of them, not by source order";
      seen.add(item.source);
    }
  }
};

/** As the console shows a source: `Decoration.Point.source #1 (name)`. */
export const sourceLabel = (source: Source, index: number) => {
  const name = sourceName(source);
  return `Decoration.${source.kind == "point" ? "Point" : "Range"}.source #${index + 1}${name ? ` (${name})` : ""}`;
};

/** Logs a source's function, or one of its decorations (walked again: the state may have moved on). */
export const logDecoration = (state: GardState, source: number, index?: number) => {
  const found = sourcesOf(state)[source];
  if (!found) throw new Error(`No decoration source ${source}`);
  const label = sourceLabel(found, source);
  if (index == null) {
    console.log(`[wordgard-devtools] ${label}`, found.fn);
    return;
  }
  const typed = asSet(found.fn(state));
  const item = typed && walkSet(typed, index + 1).items[index];
  if (!item) throw new Error("That decoration is no longer there");
  const place = item.from == item.to ? `at ${item.from}` : `at ${item.from}–${item.to}`;
  console.log(`[wordgard-devtools] ${label}, decoration ${place}`, item.value);
};
