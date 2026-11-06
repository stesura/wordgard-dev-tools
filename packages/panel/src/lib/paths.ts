import type { Path } from "@stesura/wordgard-dev-tools";

export const ROOT = "root";
export const itemId = (path: Path) => (path.length ? path.join(".") : ROOT);
export const pathOf = (id: string): Path => (id == ROOT ? [] : id.split(".").map(Number));
export const parentOf = (id: string) => {
  const path = pathOf(id);
  return path.length ? itemId(path.slice(0, -1)) : null;
};

export const isPrefix = (prefix: Path, path: Path) =>
  prefix.length <= path.length && prefix.every((n, i) => n == path[i]);
