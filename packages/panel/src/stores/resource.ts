import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";

export type Resource<T> = {
  /** Null until a load succeeds; then the last one, even after a failure. */
  value: T | null;
  error: string | null;
  /** The load this is from: 0 before any. */
  version: number;
};

export type ResourceSource<T> = {
  state: ReadableAtom<Resource<T>>;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
  /** Resolves once the latest load is in. */
  ready: () => Promise<void>;
};

/** What a tab loads from the page with `fetch`, again on each change it follows. */
export const createResource = <T>(fetch: () => Promise<T>): ResourceSource<T> => {
  let latest = 0;
  const state = atom<Resource<T>>({ value: null, error: null, version: 0 });
  let pending: Promise<void> = Promise.resolve();
  const load = async () => {
    const at = ++latest;
    try {
      const value = await fetch();
      if (at == latest) state.set({ value, error: null, version: at });
    } catch (e) {
      if (at == latest) state.set({ ...state.get(), error: errorMessage(e), version: at });
    }
  };
  return { state, load: () => (pending = load()), ready: () => pending };
};
