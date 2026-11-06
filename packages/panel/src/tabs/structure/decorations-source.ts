import type {
  DecorationInfo,
  DecorationSource,
  DecorationsInfo,
  Path,
} from "@stesura/wordgard-dev-tools";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";

/** The editor's decorations, loaded while the Structure shows them. */
export const createDecorationsSource = (
  transport: Transport,
  id: number
): ResourceSource<DecorationsInfo> =>
  createResource(() => transport.send({ type: "decorations", id }));

/** The decorations, by node. */
export type DecorationIndex = {
  sources: DecorationSource[];
  total: number;
  /** By the node they apply to. */
  on: ReadonlyMap<string, DecorationInfo[]>;
  /** Widgets, by the node holding them. */
  widgets: ReadonlyMap<string, DecorationInfo[]>;
  /** Those that apply to no node (or aren't drawn), by the node holding their position. */
  stray: ReadonlyMap<string, DecorationInfo[]>;
};

export const pathKey = (path: Path) => path.join(".");

const push = (map: Map<string, DecorationInfo[]>, key: string, item: DecorationInfo) => {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
};

export const indexDecorations = ({ sources, decorations }: DecorationsInfo): DecorationIndex => {
  const on = new Map<string, DecorationInfo[]>();
  const widgets = new Map<string, DecorationInfo[]>();
  const stray = new Map<string, DecorationInfo[]>();
  for (const item of decorations) {
    // A widget Wordgard doesn't draw (inside an atom) is listed, not drawn.
    if (item.kind == "widget" && !item.note) {
      if (item.at) push(widgets, pathKey(item.at), item);
    } else if (item.paths.length) {
      for (const path of item.paths) push(on, pathKey(path), item);
    } else if (item.at) push(stray, pathKey(item.at), item);
  }
  return { sources, total: decorations.length, on, widgets, stray };
};

/** "Point source #2 (highlights)". */
export const sourceLabel = (source: DecorationSource | undefined) =>
  source
    ? `${source.kind == "point" ? "Point" : "Range"} source #${source.index + 1}${source.name ? ` (${source.name})` : ""}`
    : "a source";

/** Everything on a node: applied to it, widgets in it, and those that apply to nothing there. */
export const decorationsOf = (index: DecorationIndex, path: Path) => {
  const key = pathKey(path);
  return [
    ...(index.on.get(key) ?? []),
    ...(index.widgets.get(key) ?? []),
    ...(index.stray.get(key) ?? []),
  ];
};
