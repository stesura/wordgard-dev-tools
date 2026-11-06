import type { SchemaInfo } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

/** The last schema stays up, with the error. */
export type SchemaState = { schema: SchemaInfo | null; error: string | null };

export type SchemaSource = {
  state: ReadableAtom<SchemaState>;
  /** Replies to an older load are dropped. Never rejects. */
  load: () => Promise<void>;
  /** Resolves once the latest load is in. */
  ready: () => Promise<void>;
};

export const createSchemaSource = (transport: Transport, id: number): SchemaSource => {
  let version = 0;
  const state = atom<SchemaState>({ schema: null, error: null });
  let pending: Promise<void> = Promise.resolve();

  const load = async () => {
    const at = ++version;
    try {
      const schema = await transport.send({ type: "schema", id });
      if (at == version) state.set({ schema, error: null });
    } catch (e) {
      if (at == version) state.set({ ...state.get(), error: errorMessage(e) });
    }
  };

  return {
    state,
    load: () => (pending = load()),
    ready: () => pending,
  };
};
