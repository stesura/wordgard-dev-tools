import type { NodeDetail, Path } from "@stesura/wordgard-dev-tools";
import { errorMessage } from "./json.ts";
import type { Transport } from "../transport.ts";
import { itemId } from "./paths.ts";

export type Detail = { node: NodeDetail; error?: undefined } | { node?: undefined; error: string };

/** What the node pane reads: details per document version, and that version. */
export type DetailSource = {
  /** A promise per (document version, path), cached: for `use()`. */
  detail: (path: Path, version: number) => Promise<Detail>;
  version: () => number;
  subscribe: (listener: () => void) => () => void;
};

// Detail promises kept: a deferred render may still show an older version's.
const KEPT = 32;

export const createDetailCache = (transport: Transport, id: number) => {
  const details = new Map<string, Promise<Detail>>();
  return (path: Path, version: number) => {
    const key = `${version}|${itemId(path)}`;
    let found = details.get(key);
    if (!found) {
      found = transport.send({ type: "node", id, path }).then(
        (node): Detail => ({ node }),
        (e): Detail => ({ error: errorMessage(e) })
      );
      details.set(key, found);
      for (const old of details.keys()) {
        if (details.size <= KEPT) break;
        details.delete(old);
      }
    }
    return found;
  };
};
