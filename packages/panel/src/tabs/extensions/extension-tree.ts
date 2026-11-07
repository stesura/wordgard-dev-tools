import type { ExtensionNode, ExtensionsInfo } from "@stesura/wordgard-dev-tools";

/**
 * A row of the tree as drawn: its node, its id (the child indices, dotted; "" is the root), its
 * place among its siblings (1-based; a virtualized tree says it, as not all rows are drawn).
 */
export type Line = {
  id: string;
  node: ExtensionNode;
  depth: number;
  collapsed: boolean;
  position: number;
  siblings: number;
};

export const pathOfId = (id: string) => (id ? id.split(".").map(Number) : []);
const childId = (id: string, index: number) => (id ? `${id}.${index}` : String(index));

/** The rows shown: the root's children, and theirs unless collapsed. */
export const linesOf = (root: ExtensionNode, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = [];
  const walk = (node: ExtensionNode, id: string, depth: number) => {
    node.children.forEach((child, i) => {
      const at = childId(id, i);
      const closed = collapsed.has(at) && child.children.length > 0;
      lines.push({
        id: at,
        node: child,
        depth,
        collapsed: closed,
        position: i + 1,
        siblings: node.children.length,
      });
      if (!closed) walk(child, at, depth + 1);
    });
  };
  walk(root, "", 0);
  return lines;
};

/** The ids of rows with children: what "collapse all" closes. */
export const folders = (root: ExtensionNode) => {
  const found: string[] = [];
  const walk = (node: ExtensionNode, id: string) =>
    node.children.forEach((child, i) => {
      const at = childId(id, i);
      if (child.children.length) found.push(at);
      walk(child, at);
    });
  walk(root, "");
  return found;
};

/** The node at an id. */
export const nodeAt = (root: ExtensionNode, id: string) =>
  pathOfId(id).reduce<ExtensionNode | undefined>((node, i) => node?.children[i], root);

/** The ids of rows whose label or value holds the query, in display order. */
export const search = (root: ExtensionNode, query: string) => {
  const needle = query.toLowerCase();
  const found: string[] = [];
  const walk = (node: ExtensionNode, id: string) =>
    node.children.forEach((child, i) => {
      const at = childId(id, i);
      if (`${child.label} ${child.value ?? ""}`.toLowerCase().includes(needle)) found.push(at);
      walk(child, at);
    });
  walk(root, "");
  return found;
};

/** The ids of an id's ancestors, outermost first. */
export const ancestorsOf = (id: string) => {
  const parts = id.split(".");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("."));
};

/** The "By facet" view: each facet, and under it its values in Wordgard's order. */
export type FacetsTree = {
  root: ExtensionNode;
  /** A row's id in the tree: a value's own row; a facet's, its first value's. */
  real: ReadonlyMap<string, string>;
};

const row = (
  label: string,
  prec: ExtensionNode["prec"],
  value: string | null,
  children: ExtensionNode[] = []
): ExtensionNode => ({
  kind: "facet",
  label,
  prec,
  value,
  duplicate: false,
  field: null,
  source: null,
  facet: null,
  order: null,
  children,
  more: 0,
});

const facetsTrees = new WeakMap<ExtensionsInfo, FacetsTree>();

export const facetsTree = (info: ExtensionsInfo): FacetsTree => {
  const cached = facetsTrees.get(info);
  if (cached) return cached;
  const real = new Map<string, string>();
  const children = info.facets.map((facet, i) => {
    const values = facet.values.map((value, j) => {
      real.set(`${i}.${j}`, value.path.join("."));
      const parts = [value.value, value.from ? `in ${value.from}` : null].filter(
        (part): part is string => Boolean(part)
      );
      return row(`#${j + 1}`, value.prec, parts.join(" · ") || null);
    });
    const [first] = facet.values;
    if (first) real.set(String(i), first.path.join("."));
    const count = `${values.length} value${values.length == 1 ? "" : "s"}`;
    return row(facet.label, "default", count, values);
  });
  const made: FacetsTree = {
    root: { ...row("facets", "default", null, children), kind: "configuration" },
    real,
  };
  facetsTrees.set(info, made);
  return made;
};

/** A tree row's id in the "By facet" view: its value's row. */
export const facetsIdOf = (tree: FacetsTree, id: string) =>
  [...tree.real].find(([at, real]) => at.includes(".") && real == id)?.[0] ?? null;
