import * as wordgardCommand from "wordgard/command";
import * as wordgardEditor from "wordgard/editor";
import type { GardState } from "wordgard/state";
import * as wordgardState from "wordgard/state";
import { sourcesOf } from "./decorations.ts";
import { fieldsOf } from "./fields.ts";
import {
  compartmentOf,
  facetExtensions,
  fieldProvides,
  isDerived,
  isField,
  precedenceOf,
  providerOf,
} from "./internals.ts";
import {
  PRECEDENCES,
  type ExtensionDetail,
  type ExtensionNode,
  type ExtensionsInfo,
  type FacetOrder,
  type FacetValue,
  type Path,
  type Precedence,
} from "./protocol.ts";
import type { Entry } from "./registry.ts";
import { preview } from "./serialise.ts";
import { tagFacets } from "./tags.ts";

// Loaded with the serialisers, on the first panel request. The tree replays Wordgard's own walk
// of a configuration (`flatten` in wordgard/state): what it keeps, at which precedence.

/** Rows sent per request. */
export const EXTENSIONS = 5000;
const DEFAULT = 2;

/** The app's names: `wordgardDevtools({fields, names})`. */
export type Labels = Pick<Entry, "fields" | "names">;

type Shape = {
  node: ExtensionNode;
  ext: unknown;
  facet: GardState.Facet<unknown, unknown> | null;
  field: GardState.Field<unknown> | GardState.Field.Derived<unknown> | null;
  /** Its label is the app's (by `names`, or an object's `name`). */
  named: boolean;
  children: Shape[];
};

const isObject = (value: unknown): value is object => typeof value == "object" && value != null;

/** A value of a namespace by its path, or undefined: a Wordgard without it isn't an error. */
const read = (from: unknown, keys: string[]): unknown =>
  keys.reduce<unknown>(
    (value, key) =>
      isObject(value) || typeof value == "function" ? Reflect.get(value, key) : undefined,
    from
  );

const KNOWN: [unknown, string][] = [
  ...[
    "editable",
    "contentAttributes",
    "editorAttributes",
    "styleModule",
    "scrollHandler",
    "transactionListener",
    "updateListener",
    "cspNonce",
    "coveredMargins",
    "clipboardOutputFilter",
    "clipboardOutputHTMLFilter",
    "clipboardTextSerializer",
    "clipboardOutputTextFilter",
    "clipboardInputFilter",
    "clipboardInputHTMLFilter",
    "clipboardTextParser",
    "clipboardInputTextFilter",
    "pasteHandler",
    "dropHandler",
    "exceptionSink",
    "cursorBlinkRate",
    "mouseSelectionStyle",
    "dragMovesSelection",
    "colorScheme",
  ].map((name): [unknown, string] => [wordgardEditor, `Wordgard.${name}`]),
  [wordgardEditor, "Decoration.Point.source"],
  [wordgardEditor, "Decoration.Range.source"],
  [wordgardEditor, "KeyBinding.source"],
  [wordgardEditor, "KeyBinding.useDefaultKeymap"],
  [wordgardEditor, "Panel.show"],
  [wordgardEditor, "Tooltip.show"],
  [wordgardState, "GardState.readOnly"],
  [wordgardState, "GardState.isAtom"],
  [wordgardState, "GardState.schemaElement"],
  [wordgardState, "GardState.textLTR"],
  [wordgardState, "GardState.textblockLTR"],
  [wordgardState, "GardState.visualCursorMotion"],
  [wordgardState, "Transaction.extender"],
  [wordgardState, "Transaction.appender"],
  [wordgardCommand, "Menu.source"],
];

let known: Map<unknown, string> | null = null;
/** The facets Wordgard exports, by name. The others have none (and aren't exported). */
const knownFacets = () =>
  (known ??= new Map(
    KNOWN.map(([from, name]): [unknown, string] => [read(from, name.split(".")), name]).filter(
      ([facet]) => facet != null
    )
  ));

// Numbered as first seen, page-wide: the same facet or compartment keeps its number across reloads.
const numbered = () => {
  const numbers = new WeakMap<object, number>();
  let count = 0;
  return (value: object) => {
    let n = numbers.get(value);
    if (n == null) numbers.set(value, (n = ++count));
    return n;
  };
};
const facetNumber = numbered();
const compartmentNumber = numbered();
const derivedNumber = numbered();

const precedence = (prec: number): Precedence => PRECEDENCES[prec] ?? "default";

/**
 * Which occurrence of each extension Wordgard keeps: its highest precedence, the first at that
 * precedence; a later, higher one removes an earlier one. Keyed by the occurrence's walk path.
 */
const keptOccurrences = (state: GardState) => {
  const kept = new Map<unknown, string>();
  const seen = new Map<unknown, number>();
  const inner = (ext: unknown, prec: number, at: string) => {
    const was = seen.get(ext);
    if (was != null && was <= prec) return;
    seen.set(ext, prec);
    kept.set(ext, at);
    const compartment = compartmentOf(ext);
    const wrapped = precedenceOf(ext);
    const provider = providerOf(ext);
    if (Array.isArray(ext)) ext.forEach((e, i) => inner(e, prec, `${at}.${i}`));
    else if (compartment)
      inner(compartment.compartment.get(state) ?? compartment.inner, prec, `${at}.c`);
    else if (wrapped) inner(wrapped.inner, wrapped.prec, `${at}.c`);
    else if (isField(ext)) {
      const provides = fieldProvides(ext);
      if (provides) inner(provides, prec, `${at}.p`);
    } else if (isDerived(ext)) return;
    else if (provider) {
      const enabled = facetExtensions(provider.facet);
      if (enabled) inner(enabled, DEFAULT, `${at}.e`);
    } else if (isObject(ext) && "extension" in ext && ext.extension)
      inner(ext.extension, prec, `${at}.x`);
  };
  inner(state.config.base, DEFAULT, "r");
  return { kept, seen };
};

const className = (ext: object) => {
  const name = ext.constructor?.name;
  return name && name != "Object" ? name : null;
};

/** `{name, extension}`: a plain object's own name. A class's `name` may mean anything else. */
const ownName = (ext: unknown) => {
  if (!isObject(ext) || Array.isArray(ext)) return null;
  const proto: unknown = Object.getPrototypeOf(ext);
  if (proto !== Object.prototype && proto !== null) return null;
  return "extension" in ext && ext.extension && "name" in ext && typeof ext.name == "string"
    ? ext.name || null
    : null;
};

const build = (state: GardState, labels: Labels): { root: Shape; facets: FacetOrder[] } => {
  // The app's names, by identity: the first name given to a value.
  const named = new Map<unknown, string>();
  for (const [name, value] of Object.entries(labels.names ?? {}))
    if (!named.has(value)) named.set(value, name);
  const { kept, seen } = keptOccurrences(state);
  // Every prefix of a kept occurrence: a dropped one holding a kept one is walked.
  const holding = new Set<string>();
  for (const at of kept.values()) {
    const parts = at.split(".");
    for (let i = 1; i < parts.length; i++) holding.add(parts.slice(0, i).join("."));
  }
  const fields = fieldsOf(state);
  const sources = sourcesOf(state);
  const pointSource = read(wordgardEditor, ["Decoration", "Point", "source"]);
  const rangeSource = read(wordgardEditor, ["Decoration", "Range", "source"]);
  const facetsShown = new Set<unknown>();
  // Wordgard's private tag facets, named by the factories that provide them.
  const tagged = tagFacets(state);
  const facetNames = new Map(knownFacets());
  for (const [facet, name] of [
    [tagged.shape, "Decoration.Tag.shape"],
    [tagged.wrapper, "Decoration.Tag.wrapper"],
    [tagged.widget, "Decoration.Tag.widget"],
    [tagged.attribute, "Decoration.Tag.attribute"],
    [tagged.markShape, "Decoration.Mark.shape"],
  ] satisfies [unknown, string][])
    if (facet) facetNames.set(facet, name);
  const facetLabel = (facet: object) =>
    named.get(facet) ?? facetNames.get(facet) ?? `facet #${facetNumber(facet)}`;
  let count = 0;

  const shape = (
    ext: unknown,
    node: Omit<ExtensionNode, "children" | "more" | "duplicate" | "order">
  ): Shape => ({
    node: { ...node, duplicate: false, order: null, children: [], more: 0 },
    ext,
    facet: null,
    field: null,
    named: false,
    children: [],
  });

  const base = { value: null, field: null, source: null, facet: null };

  const add = (parent: Shape, ext: unknown, prec: number, where: string) => {
    if (count >= EXTENSIONS) {
      parent.node.more++;
      return;
    }
    const child = row(ext, prec, where);
    parent.children.push(child);
    parent.node.children.push(child.node);
  };

  /** The rows for some content: a kept, unnamed array's items, or the one row. */
  const contents = (parent: Shape, content: unknown, prec: number, at: string) => {
    if (Array.isArray(content) && kept.get(content) == at && ownLabel(content) == null)
      content.forEach((ext, i) => add(parent, ext, prec, `${at}.${i}`));
    else add(parent, content, prec, at);
  };

  const row = (ext: unknown, prec: number, at: string): Shape => {
    count++;
    const p = precedence(prec);
    if (kept.get(ext) != at) {
      const dropped = shape(ext, {
        ...base,
        kind: kindOf(ext),
        label: labelOf(ext),
        prec: p,
        value: `duplicate: kept at ${precedence(seen.get(ext) ?? prec)} precedence`,
      });
      dropped.node.duplicate = true;
      dropped.named = ownLabel(ext) != null;
      // Only what it holds that Wordgard keeps from here: it says nothing of its own.
      if (holding.has(at)) children(dropped, ext, prec, at);
      return dropped;
    }
    // One item: shown in its parent's place, unless named.
    if (Array.isArray(ext) && ext.length == 1 && ownLabel(ext) == null)
      return row(ext[0], prec, `${at}.0`);
    const made = shape(ext, { ...base, kind: kindOf(ext), label: labelOf(ext), prec: p });
    made.named = ownLabel(ext) != null;
    describe(made, ext);
    children(made, ext, prec, at);
    return made;
  };

  const kindOf = (ext: unknown): ExtensionNode["kind"] =>
    Array.isArray(ext)
      ? "group"
      : compartmentOf(ext)
        ? "compartment"
        : precedenceOf(ext)
          ? "precedence"
          : isField(ext)
            ? "field"
            : isDerived(ext)
              ? "derived field"
              : providerOf(ext)
                ? "facet"
                : isObject(ext) && "extension" in ext && ext.extension
                  ? "object"
                  : "unknown";

  /** The app's name for an extension: by `names` (itself, or its compartment), or its own. */
  const ownLabel = (ext: unknown): string | null => {
    const compartment = compartmentOf(ext);
    return (
      named.get(ext) ??
      (compartment ? named.get(compartment.compartment) : undefined) ??
      ownName(ext)
    );
  };

  const labelOf = (ext: unknown): string => {
    // `fields` first, as the Fields tab names a field.
    const own =
      (isField(ext) ? Object.entries(labels.fields ?? {}).find(([, f]) => f == ext)?.[0] : null) ??
      ownLabel(ext);
    if (own != null) return own;
    const compartment = compartmentOf(ext);
    const wrapped = precedenceOf(ext);
    const provider = providerOf(ext);
    if (Array.isArray(ext)) return `${ext.length} extensions`;
    if (compartment) return `compartment #${compartmentNumber(compartment.compartment)}`;
    if (wrapped) return precedence(wrapped.prec);
    if (isField(ext)) {
      const name = Object.entries(labels.fields ?? {}).find(([, f]) => f == ext)?.[0];
      return name ?? `field #${fields.indexOf(ext) + 1}`;
    }
    if (isDerived(ext)) return `derived field #${derivedNumber(ext)}`;
    if (provider) return facetLabel(provider.facet);
    if (isObject(ext) && "extension" in ext && ext.extension)
      return className(ext) ?? "extension object";
    return "unknown extension";
  };

  /** A kept row's own values: a field's index, a facet's value and name, a source's index. */
  const describe = (made: Shape, ext: unknown) => {
    const { node } = made;
    const compartment = compartmentOf(ext);
    const wrapped = precedenceOf(ext);
    const provider = providerOf(ext);
    // Named, an array or a precedence says what it is in its value.
    if (made.named && Array.isArray(ext)) node.value = `${ext.length} extensions`;
    else if (made.named && wrapped) node.value = `${precedence(wrapped.prec)} precedence`;
    if (compartment) {
      const content = compartment.compartment.get(state) ?? compartment.inner;
      if (content !== compartment.inner) node.value = "reconfigured";
    } else if (isField(ext)) {
      made.field = ext;
      const index = fields.indexOf(ext);
      node.field = index < 0 ? null : index;
    } else if (isDerived(ext)) made.field = ext;
    else if (provider) {
      const name = named.get(provider.facet) ?? facetNames.get(provider.facet) ?? null;
      node.value = provider.isStatic
        ? (preview(provider.value) ?? String(provider.value))
        : "computed";
      if (name && !facetsShown.has(provider.facet)) {
        facetsShown.add(provider.facet);
        node.facet = name;
        made.facet = provider.facet;
      }
      if (provider.isStatic && (provider.facet === pointSource || provider.facet === rangeSource)) {
        const kind = provider.facet === pointSource ? "point" : "range";
        const index = sources.findIndex((s) => s.kind == kind && s.fn === provider.value);
        node.source = index < 0 ? null : index;
      }
    } else if (kindOf(ext) == "unknown") node.value = preview(ext);
  };

  /** The rows inside: walked at the paths `keptOccurrences` recorded. */
  const children = (made: Shape, ext: unknown, prec: number, at: string) => {
    const compartment = compartmentOf(ext);
    const wrapped = precedenceOf(ext);
    const provider = providerOf(ext);
    if (Array.isArray(ext)) ext.forEach((e, i) => add(made, e, prec, `${at}.${i}`));
    else if (compartment)
      contents(made, compartment.compartment.get(state) ?? compartment.inner, prec, `${at}.c`);
    else if (wrapped) contents(made, wrapped.inner, wrapped.prec, `${at}.c`);
    else if (isField(ext)) {
      const provides = fieldProvides(ext);
      if (provides) contents(made, provides, prec, `${at}.p`);
    } else if (provider) {
      const enabled = facetExtensions(provider.facet);
      if (enabled) contents(made, enabled, DEFAULT, `${at}.e`);
    } else if (isObject(ext) && "extension" in ext && ext.extension)
      contents(made, ext.extension, prec, `${at}.x`);
  };

  const root = shape(state.config.base, {
    ...base,
    kind: "configuration",
    label: "configuration",
    prec: "default",
  });
  contents(root, state.config.base, DEFAULT, "r");

  // Each facet's kept values, in tree order: Wordgard's walk order. `flatten` puts each in its
  // precedence's bucket in that order, then joins the buckets: the facet's input.
  const byFacet = new Map<
    object,
    { label: string; wordgard: string | null; values: FacetValue[]; nodes: ExtensionNode[] }
  >();
  const walk = (parent: Shape, path: Path, from: string[]) =>
    parent.children.forEach((child, i) => {
      const at = [...path, i];
      const provider = child.node.duplicate ? null : providerOf(child.ext);
      if (provider) {
        let facet = byFacet.get(provider.facet);
        if (!facet)
          byFacet.set(
            provider.facet,
            (facet = {
              label: facetLabel(provider.facet),
              wordgard: facetNames.get(provider.facet) ?? null,
              values: [],
              nodes: [],
            })
          );
        facet.values.push({
          path: at,
          prec: child.node.prec,
          value: child.node.value,
          from: from.join(" › "),
        });
        facet.nodes.push(child.node);
      }
      const unnamedArray = child.node.kind == "group" && !child.named;
      walk(child, at, unnamedArray ? from : [...from, child.node.label]);
    });
  walk(root, [], []);
  const rank = (prec: Precedence) => PRECEDENCES.indexOf(prec);
  const numbered = (facet: object) => !named.has(facet) && !facetNames.has(facet);
  const sorted = [...byFacet].toSorted(([a, x], [b, y]) =>
    numbered(a) != numbered(b)
      ? Number(numbered(a)) - Number(numbered(b))
      : numbered(a)
        ? facetNumber(a) - facetNumber(b)
        : x.label.localeCompare(y.label)
  );
  const facets = sorted.map(([, facet], index): FacetOrder => {
    const order = facet.values
      .map((value, i) => ({ value, node: facet.nodes[i] }))
      .toSorted((a, b) => rank(a.value.prec) - rank(b.value.prec));
    order.forEach(({ node }, i) => {
      if (node) node.order = { facet: index, index: i, of: order.length };
    });
    return {
      label: facet.label,
      wordgard: facet.wordgard,
      values: order.map(({ value }) => value),
    };
  });
  return { root, facets };
};

type Cached = Labels & { shape: Shape; facets: FacetOrder[]; count: number };
const byConfig = new WeakMap<GardState.Configuration, Cached>();

const shapeOf = (state: GardState, labels: Labels): Cached => {
  const cached = byConfig.get(state.config);
  // The registry replaces either object when the app adds names.
  if (cached && cached.fields == labels.fields && cached.names == labels.names) return cached;
  const { root, facets } = build(state, labels);
  let count = 0;
  const countRows = (s: Shape) => {
    count++;
    s.children.forEach(countRows);
  };
  root.children.forEach(countRows);
  const made = { fields: labels.fields, names: labels.names, shape: root, facets, count };
  byConfig.set(state.config, made);
  return made;
};

/** The configuration's extensions, as a tree. Cached per configuration: its values are static. */
export const extensions = (state: GardState, labels: Labels = {}): ExtensionsInfo => {
  const { shape, facets, count } = shapeOf(state, labels);
  const capped = (s: Shape): boolean => s.node.more > 0 || s.children.some(capped);
  return { root: shape.node, count, capped: capped(shape), facets };
};

const at = (state: GardState, labels: Labels, path: Path) => {
  let found: Shape | undefined = shapeOf(state, labels).shape;
  for (const index of path) found = found?.children[index];
  if (!found) throw new Error("That extension is no longer there");
  return found;
};

/** A row's values in the current state: a known facet's, a field's. */
export const extensionDetail = (state: GardState, labels: Labels, path: Path): ExtensionDetail => {
  const { facet, field } = at(state, labels, path);
  const guarded = (read: () => unknown) => {
    try {
      return preview(read());
    } catch (e) {
      return `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  return {
    resolved: facet ? guarded(() => state.facet(facet)) : null,
    value: field
      ? guarded(() => (isField(field) ? state.field(field, false) : state.field(field)))
      : null,
  };
};

/** Logs a row's extension, or its facet's value, live. */
export const logExtension = (state: GardState, labels: Labels, path: Path, resolved = false) => {
  const { node, ext, facet } = at(state, labels, path);
  if (resolved) {
    if (!facet) throw new Error(`${node.label} has no resolved value here`);
    console.log(`[wordgard-devtools] state.facet(${node.facet ?? node.label})`, state.facet(facet));
    return;
  }
  console.log(`[wordgard-devtools] ${node.label}`, ext);
};
