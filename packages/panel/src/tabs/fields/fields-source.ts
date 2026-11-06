import type { FieldDetail, FieldsInfo } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

export type FieldResult =
  { field: FieldDetail; error?: undefined } | { field?: undefined; error: string };
export type ChangeResult =
  { value: unknown; error?: undefined } | { value?: undefined; error: string };

export type FieldsState = {
  fields: FieldsInfo | null;
  /** The last fields stay up, with the error. */
  error: string | null;
  /** The load these are from: a field's detail is cached per version. */
  version: number;
};

export type FieldsSource = {
  state: ReadableAtom<FieldsState>;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
  /** A promise per (version, field), cached: for `use()`. */
  detail: (index: number, version: number) => Promise<FieldResult>;
  /** The value a change in a field's history set: a promise per change, cached (it never changes). */
  change: (index: number, seq: number) => Promise<ChangeResult>;
  /** Logs it in the page's console. */
  logChange: (index: number, seq: number) => void;
  /** Logs a field's whole history in the page's console. */
  logHistory: (index: number) => void;
  /** Logs a field's live value in the page's console. */
  logValue: (index: number) => void;
};

// Detail promises kept: a deferred render may still show an older version's.
const KEPT = 32;

export const createFieldsSource = (transport: Transport, id: number): FieldsSource => {
  let version = 0;
  const state = atom<FieldsState>({ fields: null, error: null, version });
  const details = new Map<string, Promise<FieldResult>>();
  const changes = new Map<string, Promise<ChangeResult>>();

  return {
    state,
    load: async () => {
      const at = ++version;
      try {
        const loaded = await transport.send({ type: "fields", id });
        if (at == version) state.set({ fields: loaded, error: null, version: at });
      } catch (e) {
        if (at == version) state.set({ ...state.get(), error: errorMessage(e), version: at });
      }
    },
    detail: (index, at) => {
      const key = `${at}|${index}`;
      let found = details.get(key);
      if (!found) {
        found = transport.send({ type: "field", id, index }).then(
          (field): FieldResult => ({ field }),
          (e): FieldResult => ({ error: errorMessage(e) })
        );
        details.set(key, found);
        for (const old of details.keys()) {
          if (details.size <= KEPT) break;
          details.delete(old);
        }
      }
      return found;
    },
    change: (index, seq) => {
      const key = `${index}|${seq}`;
      let found = changes.get(key);
      if (!found) {
        found = transport.send({ type: "fieldChange", id, index, seq }).then(
          (value): ChangeResult => ({ value }),
          (e): ChangeResult => ({ error: errorMessage(e) })
        );
        changes.set(key, found);
        for (const old of changes.keys()) {
          if (changes.size <= KEPT) break;
          changes.delete(old);
        }
      }
      return found;
    },
    logChange: (index, seq) => {
      transport.send({ type: "logField", id, index, seq }).catch(() => {});
    },
    logHistory: (index) => {
      transport.send({ type: "logField", id, index, history: true }).catch(() => {});
    },
    logValue: (index) => {
      transport.send({ type: "logField", id, index }).catch(() => {});
    },
  };
};
