import type { Path } from "@stesura/wordgard-dev-tools";

export const ROOT = "root";
export const itemId = (path: Path) => (path.length ? path.join(".") : ROOT);
/** A path written as its indices, dot-separated: `""` is the root. */
export const parsePath = (text: string): Path => (text ? text.split(".").map(Number) : []);
/** An element's `data-path`, or null without one. */
export const dataPath = (element: Element | null) => {
  const text = element?.getAttribute("data-path");
  return text == null ? null : parsePath(text);
};
export const pathOf = (id: string): Path => (id == ROOT ? [] : parsePath(id));
export const parentOf = (id: string) => {
  const path = pathOf(id);
  return path.length ? itemId(path.slice(0, -1)) : null;
};

export const isPrefix = (prefix: Path, path: Path) =>
  prefix.length <= path.length && prefix.every((n, i) => n == path[i]);
