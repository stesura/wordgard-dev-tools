import type { ExtensionNode } from "@stesura/wordgard-dev-tools";

/** A row of the tree as drawn: its node, its id (the child indices, dotted; "" is the root). */
export type Line = { id: string; node: ExtensionNode; depth: number; collapsed: boolean };

export const pathOfId = (id: string) => (id ? id.split(".").map(Number) : []);
const childId = (id: string, index: number) => (id ? `${id}.${index}` : String(index));

/** The rows shown: the root's children, and theirs unless collapsed. */
export const linesOf = (root: ExtensionNode, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = [];
  const walk = (node: ExtensionNode, id: string, depth: number) => {
    node.children.forEach((child, i) => {
      const at = childId(id, i);
      const closed = collapsed.has(at) && child.children.length > 0;
      lines.push({ id: at, node: child, depth, collapsed: closed });
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
