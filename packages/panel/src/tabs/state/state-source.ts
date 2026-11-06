import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

export type StateView = { json: unknown; loaded: boolean; error: string | null };

export type StateSource = {
  state: ReadableAtom<StateView>;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
};

export const createStateSource = (transport: Transport, id: number): StateSource => {
  const state = atom<StateView>({ json: null, loaded: false, error: null });
  let version = 0;
  return {
    state,
    load: async () => {
      const at = ++version;
      try {
        const json = await transport.send({ type: "stateJSON", id });
        if (at == version) state.set({ json, loaded: true, error: null });
      } catch (e) {
        // The last state stays up, with the error.
        if (at == version) state.set({ ...state.get(), error: errorMessage(e) });
      }
    },
  };
};
