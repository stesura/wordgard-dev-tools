import type { Mark, Node } from "wordgard/doc";
import * as wordgardDoc from "wordgard/doc";
import * as wordgardEditor from "wordgard/editor";
import type { GardState } from "wordgard/state";
import { renderElt, selectorText } from "./decorations.ts";
import { tagFacetsOf, type TagFacets } from "./internals.ts";
import type { TagDecorations } from "./protocol.ts";
import { preview } from "./serialise.ts";

// Loaded with the serialisers, on the first panel request. Tag decorations live in private facets
// (see internals.ts); their functions of a tag are called only with a real node's tag.

const PLACES = ["before", "after", "start", "end"];

const isObject = (value: unknown): value is object => typeof value == "object" && value != null;

const isWidget = (value: unknown): value is wordgardEditor.Widget =>
  typeof wordgardEditor.Widget == "function" && value instanceof wordgardEditor.Widget;

/** The facets, from providers the public factories build on this schema's types. */
export const tagFacets = (state: GardState): TagFacets => {
  const { Decoration, Widget } = wordgardEditor;
  const { Elt } = wordgardDoc;
  const [node] = state.schema.nodes;
  const [mark] = state.schema.marks;
  const widget = () => Widget.define({ render: () => document.createElement("span") }).of(null);
  return tagFacetsOf({
    shape: () => node && Decoration.Tag.shape(node, () => widget()),
    wrapper: () => node && Decoration.Tag.wrapper(node, Elt.mk("span", [0])),
    widget: () => node && Decoration.Tag.widget(node, "before", widget()),
    attribute: () => node && Decoration.Tag.attribute(node, "x", ""),
    markShape: () => mark && Decoration.Mark.shape(mark, { element: "span" }),
  });
};

/** A facet's value, guarded: an unknown facet or a throwing combine reads as nothing. */
const read = (state: GardState, facet: GardState.Facet<unknown, unknown> | null): unknown => {
  if (!facet) return undefined;
  try {
    return state.facet(facet.reader);
  } catch {
    return undefined;
  }
};

const entries = (value: unknown): object[] => (Array.isArray(value) ? value.filter(isObject) : []);

const shapeText = (shape: unknown) =>
  isWidget(shape) ? `⟨widget ${preview(shape.value) ?? ""}⟩`.replace(" ⟩", "⟩") : renderElt(shape);

/** Calls an app's function of a tag, guarded. */
const evaluate = (fn: (tag: Node.Tag) => unknown, tag: Node.Tag) => {
  try {
    return { value: fn(tag), error: null };
  } catch (e) {
    return { value: undefined, error: e instanceof Error ? e.message : String(e) };
  }
};

const isTagFunction = (value: unknown): value is (tag: Node.Tag) => unknown =>
  typeof value == "function";

export type TypeDecorations = {
  nodes: Map<Node.Type, TagDecorations>;
  /** Mark types whose shape a decoration overrides: the shape it draws them with. */
  marks: Map<Mark.Type, { shape: object }>;
};

/** What the editor's tag decorations do to each node type, and which mark shapes they override. */
export const typeDecorations = (state: GardState): TypeDecorations => {
  const facets = tagFacets(state);
  const { doc } = state;
  // The first node of each type: functions of the tag are evaluated on it. Walked once, when a
  // function needs it.
  let firsts: Map<Node.Type, { tag: Node.Tag; pos: number }> | null = null;
  const firstOf = (type: Node.Type) => {
    if (!firsts) {
      const found = new Map<Node.Type, { tag: Node.Tag; pos: number }>([
        [doc.type, { tag: doc.tag, pos: 0 }],
      ]);
      doc.iterate((node: Node, pos: number) => {
        if (!found.has(node.type)) found.set(node.type, { tag: node.tag, pos });
      });
      firsts = found;
    }
    return firsts.get(type);
  };
  const nodes = new Map<Node.Type, TagDecorations>();
  const of = (type: Node.Type) => {
    let found = nodes.get(type);
    if (!found) {
      found = { shape: null, wrappers: [], widgets: [], attributes: [], at: null, errors: [] };
      nodes.set(type, found);
    }
    return found;
  };
  /**
   * A function of the tag's result, as text; never called without a real node of the type.
   * Wordgard wraps a constant as `() => value`: no tag needed.
   */
  const evaluated = (
    type: Node.Type,
    value: unknown,
    text: (result: unknown) => string
  ): string => {
    if (!isTagFunction(value)) return text(value);
    if (value.length == 0) {
      const constant = evaluate(() => Reflect.apply(value, undefined, []), doc.tag);
      if (constant.error == null) return text(constant.value);
      of(type).errors.push(constant.error);
      return "function (it threw)";
    }
    const first = firstOf(type);
    if (!first) return "function (no node of this type to evaluate it on)";
    of(type).at = first.pos;
    const { value: result, error } = evaluate(value, first.tag);
    if (error != null) {
      of(type).errors.push(error);
      return "function (it threw)";
    }
    return text(result);
  };
  // The schema's own types, by identity.
  const nodeType = (value: unknown) => state.schema.nodes.find((t) => t === value) ?? null;
  const typeOf = (entry: object) => ("type" in entry ? nodeType(entry.type) : null);

  const shapes = read(state, facets.shape);
  if (shapes instanceof Map)
    for (const [key, fn] of shapes) {
      const type = nodeType(key);
      if (type) of(type).shape = evaluated(type, fn, shapeText);
    }
  for (const entry of entries(read(state, facets.wrapper))) {
    const type = typeOf(entry);
    if (!type) continue;
    const target = "target" in entry ? selectorText(entry.target) : null;
    const elt = "elt" in entry ? renderElt(entry.elt) : "?";
    of(type).wrappers.push(target ? `${elt} around ${target}` : elt);
  }
  for (const entry of entries(read(state, facets.widget))) {
    const type = typeOf(entry);
    if (!type) continue;
    const place =
      "place" in entry && typeof entry.place == "number" ? (PLACES[entry.place] ?? "?") : "?";
    const widget = "widget" in entry ? entry.widget : undefined;
    of(type).widgets.push(`${place}: ${evaluated(type, widget, shapeText)}`);
  }
  for (const entry of entries(read(state, facets.attribute))) {
    const type = typeOf(entry);
    if (!type) continue;
    const name = "attr" in entry ? String(entry.attr) : "?";
    const target = "target" in entry ? selectorText(entry.target) : null;
    const value = evaluated(type, "value" in entry ? entry.value : undefined, (v) =>
      JSON.stringify(String(v))
    );
    of(type).attributes.push(`${name}=${value}${target ? ` on ${target}` : ""}`);
  }
  const marks = new Map<Mark.Type, { shape: object }>();
  const markShapes = read(state, facets.markShape);
  if (markShapes instanceof Map)
    for (const [key, modified] of markShapes) {
      const type = state.schema.marks.find((t) => t === key);
      const spec = isObject(modified) && "spec" in modified ? modified.spec : null;
      if (type && isObject(spec) && "shape" in spec && isObject(spec.shape))
        marks.set(type, { shape: spec.shape });
    }
  return { nodes, marks };
};
