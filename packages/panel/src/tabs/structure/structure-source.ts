import type { StructureNode } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { createDetailCache, type DetailSource } from "#lib/detail-cache.ts";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

/** The last structure stays up, with the error. */
export type StructureState = { doc: StructureNode | null; error: string | null };

export type StructureSource = DetailSource & {
  state: ReadableAtom<StructureState>;
  /** Fetches the whole document; replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
  /** Resolves once the latest load is in. */
  ready: () => Promise<void>;
};

export const createStructureSource = (transport: Transport, id: number): StructureSource => {
  let at = 0;
  const state = atom<StructureState>({ doc: null, error: null });
  const version = atom(0);
  let pending: Promise<void> = Promise.resolve();

  const load = async () => {
    const mine = ++at;
    try {
      const doc = await transport.send({ type: "structure", id });
      if (mine != at) return;
      state.set({ doc, error: null });
    } catch (e) {
      if (mine != at) return;
      state.set({ ...state.get(), error: errorMessage(e) });
    }
    version.set(mine);
  };

  return {
    state,
    version,
    load: () => (pending = load()),
    ready: () => pending,
    detail: createDetailCache(transport, id),
  };
};
