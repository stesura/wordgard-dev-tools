import { errorMessage } from "./store.ts";
import type { Transport } from "./transport.ts";

export type StateView = { json: unknown; loaded: boolean; error: string | null };

export type StateSource = {
  get: () => StateView;
  subscribe: (listener: () => void) => () => void;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
};

export const createStateSource = (transport: Transport, id: number): StateSource => {
  let view: StateView = { json: null, loaded: false, error: null };
  let version = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load: async () => {
      const at = ++version;
      try {
        const json = await transport.send({ type: "stateJSON", id });
        if (at != version) return;
        view = { json, loaded: true, error: null };
      } catch (e) {
        if (at != version) return;
        // The last state stays up, with the error.
        view = { ...view, error: errorMessage(e) };
      }
      for (const listener of listeners) listener();
    },
  };
};
