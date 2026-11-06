import type { Path, ViewNode } from "@stesura/wordgard-dev-tools";
import { includes } from "#lib/text.ts";

/** One DOM node: its id is its child indices from the content element (`""` for it), dot-separated. */
export type Line = { id: string; depth: number; node: ViewNode; collapsed: boolean };

export const pathOf = (id: string) => (id ? id.split(".").map(Number) : []);

export const flatten = (root: ViewNode, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = [];
  const walk = (node: ViewNode, id: string, depth: number) => {
    const shut = collapsed.has(id) && node.children.length > 0;
    lines.push({ id, depth, node, collapsed: shut });
    if (!shut)
      node.children.forEach((child, index) =>
        walk(child, id ? `${id}.${index}` : String(index), depth + 1)
      );
  };
  walk(root, "", 0);
  return lines;
};

/** The line of the element drawing the node at `path`, else its nearest ancestor's; the content element's for the document. */
export const lineOf = (root: ViewNode, path: Path) => {
  const find = (node: ViewNode, id: string, key: string): string | null => {
    if (node.node?.path.join(".") == key) return id;
    for (const [index, child] of node.children.entries()) {
      const found = find(child, id ? `${id}.${index}` : String(index), key);
      if (found != null) return found;
    }
    return null;
  };
  for (let at = path; at.length; at = at.slice(0, -1)) {
    const found = find(root, "", at.join("."));
    if (found != null) return found;
  }
  return "";
};

/** Ids of the nodes matching a query, in display order: text by its text, elements by tag, attribute or node name. */
export const search = (root: ViewNode, query: string) => {
  const found: string[] = [];
  const walk = (node: ViewNode, id: string) => {
    const hit =
      node.kind == "text"
        ? includes(node.text ?? "", query)
        : includes(node.tag ?? "", query) ||
          node.attrs.some(([name, value]) => includes(`${name}="${value}"`, query)) ||
          (node.node != null && includes(node.node.name, query));
    if (hit) found.push(id);
    node.children.forEach((child, index) => walk(child, id ? `${id}.${index}` : String(index)));
  };
  walk(root, "");
  return found;
};

export const folders = (node: ViewNode, id = "", out: string[] = []) => {
  if (!node.children.length) return out;
  out.push(id);
  node.children.forEach((child, index) =>
    folders(child, id ? `${id}.${index}` : String(index), out)
  );
  return out;
};
