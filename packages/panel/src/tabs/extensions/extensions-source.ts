import type {
  DecorationInfo,
  DecorationSource,
  ExtensionDetail,
  ExtensionsInfo,
} from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import type { Transport } from "../../transport.ts";
import { pathOfId } from "./extension-tree.ts";

/** The selected row's values in the current state; a decoration source's output. */
export type RowValues = {
  id: string | null;
  values: ExtensionDetail | null;
  /** A decoration source's: itself, and its decorations. */
  output: { source: DecorationSource | null; decorations: DecorationInfo[] } | null;
  error: string | null;
};

export type ExtensionsSource = {
  tree: ResourceSource<ExtensionsInfo>;
  row: ReadableAtom<RowValues>;
  /** Loads a row's values (and a source's output); null clears them. Never rejects. */
  loadRow: (id: string | null, source: number | null) => Promise<void>;
};

const none: RowValues = { id: null, values: null, output: null, error: null };

export const createExtensionsSource = (transport: Transport, id: number): ExtensionsSource => {
  const tree = createResource(() => transport.send({ type: "extensions", id }));
  const row = atom<RowValues>(none);
  let latest = 0;
  const loadRow = async (lineId: string | null, source: number | null) => {
    const at = ++latest;
    if (lineId == null) {
      row.set(none);
      return;
    }
    const asked = Promise.all([
      transport.send({ type: "extension", id, path: pathOfId(lineId) }),
      source == null ? null : transport.send({ type: "decorations", id }),
    ]);
    let values: ExtensionDetail;
    let decorations: Awaited<typeof asked>[1];
    try {
      [values, decorations] = await asked;
    } catch (e) {
      if (at == latest) row.set({ ...none, id: lineId, error: errorMessage(e) });
      return;
    }
    if (at != latest) return;
    row.set({
      id: lineId,
      values,
      output: decorations && {
        source: decorations.sources.find((s) => s.index == source) ?? null,
        decorations: decorations.decorations.filter((d) => d.source == source),
      },
      error: null,
    });
  };
  return { tree, row, loadRow };
};
