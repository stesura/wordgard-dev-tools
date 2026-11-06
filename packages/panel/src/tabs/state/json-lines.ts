import type { Path } from "@stesura/wordgard-dev-tools";
import { isRecord } from "#lib/json.ts";
import { includes } from "#lib/text.ts";

export const ROOT = "$";

/** One line of the JSON: a value, an object's or array's opening (or the whole of it, collapsed), or its closing. */
export type Line = {
  /** The key path from the root (`$/doc/content/0`, keys URI-encoded so a "/" in one can't split it); a closing line adds `#`. */
  id: string;
  depth: number;
  key: string | null;
  kind: "value" | "open" | "close";
  /** A value's JSON, or the brackets. */
  text: string;
  /** Opening lines: the number of entries. */
  size: number;
  type: "string" | "number" | "boolean" | "null" | "bracket";
  /** An opening shown closed, its entries hidden. */
  collapsed: boolean;
};

const typeOf = (value: unknown): Line["type"] =>
  typeof value == "string"
    ? "string"
    : typeof value == "number"
      ? "number"
      : typeof value == "boolean"
        ? "boolean"
        : "null";

/** Ids of every object and array: what "collapse all" closes. */
export const containers = (value: unknown, id = ROOT, out: string[] = []) => {
  const entries = Array.isArray(value)
    ? value.entries()
    : isRecord(value)
      ? Object.entries(value)
      : null;
  if (!entries) return out;
  out.push(id);
  for (const [key, child] of entries) containers(child, childId(id, key), out);
  return out;
};

const childId = (id: string, key: string | number) => `${id}/${encodeURIComponent(key)}`;

/** A line's keys from the root; a closing line's are its object's. */
export const keysOf = (id: string) =>
  id.replace(/#$/, "").split("/").slice(1).map(decodeURIComponent);

/** A node object's path in the document (`doc`, then `content` and an index, down), or null for other values. */
export const nodePathOf = (keys: string[]): Path | null => {
  if (keys[0] != "doc") return null;
  const path: number[] = [];
  for (let i = 1; i < keys.length; i += 2) {
    const index = Number(keys[i + 1]);
    if (keys[i] != "content" || !Number.isInteger(index)) return null;
    path.push(index);
  }
  return path;
};

export const childOf = (value: unknown, key: string): unknown =>
  Array.isArray(value) ? value[Number(key)] : isRecord(value) ? value[key] : undefined;

export const flatten = (value: unknown, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = [];
  const walk = (value: unknown, id: string, depth: number, key: string | null) => {
    const array = Array.isArray(value);
    const entries: [string | number, unknown][] | null = array
      ? [...value.entries()]
      : isRecord(value)
        ? Object.entries(value)
        : null;
    if (!entries) {
      lines.push({
        id,
        depth,
        key,
        kind: "value",
        text: JSON.stringify(value) ?? String(value),
        size: 0,
        type: typeOf(value),
        collapsed: false,
      });
      return;
    }
    const [open, close] = array ? ["[", "]"] : ["{", "}"];
    const shut = collapsed.has(id) && entries.length > 0;
    lines.push({
      id,
      depth,
      key,
      kind: "open",
      text: entries.length == 0 ? open + close : shut ? `${open} … ${close}` : open,
      size: entries.length,
      type: "bracket",
      collapsed: shut,
    });
    if (shut || entries.length == 0) return;
    for (const [k, child] of entries)
      walk(child, childId(id, k), depth + 1, array ? null : String(k));
    lines.push({
      id: `${id}#`,
      depth,
      key: null,
      kind: "close",
      text: close,
      size: 0,
      type: "bracket",
      collapsed: false,
    });
  };
  walk(value, ROOT, 0, null);
  return lines;
};

/** Ids of the lines whose key or value holds the query, in display order, collapsed or not. */
export const search = (value: unknown, query: string) => {
  const found: string[] = [];
  const walk = (value: unknown, id: string, key: string | null) => {
    const entries: [string | number, unknown][] | null = Array.isArray(value)
      ? [...value.entries()]
      : isRecord(value)
        ? Object.entries(value)
        : null;
    if ((key != null && includes(key, query)) || (!entries && includes(String(value), query)))
      found.push(id);
    for (const [k, child] of entries ?? [])
      walk(child, childId(id, k), Array.isArray(value) ? null : String(k));
  };
  walk(value, ROOT, null);
  return found;
};
