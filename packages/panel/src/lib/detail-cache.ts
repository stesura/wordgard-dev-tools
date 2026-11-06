import { createPromiseCache } from "./promise-cache.ts";
import type { NodeDetail, Path } from "@stesura/wordgard-dev-tools";
import type { ReadableAtom } from "nanostores";
import { errorMessage } from "./json.ts";
import type { Transport } from "../transport.ts";
import { itemId } from "./paths.ts";

export type Detail = { node: NodeDetail; error?: undefined } | { node?: undefined; error: string };

/** What the node pane reads: details per document version, and that version. */
export type DetailSource = {
  /** A promise per (document version, path), cached: for `use()`. */
  detail: (path: Path, version: number) => Promise<Detail>;
  /** `version`: the load the shown document is from. */
  state: ReadableAtom<{ version: number }>;
};

export const createDetailCache = (transport: Transport, id: number) => {
  const details = createPromiseCache<Detail>();
  return (path: Path, version: number) =>
    details.get(`${version}|${itemId(path)}`, () =>
      transport.send({ type: "node", id, path }).then(
        (node): Detail => ({ node }),
        (e): Detail => ({ error: errorMessage(e) })
      )
    );
};
