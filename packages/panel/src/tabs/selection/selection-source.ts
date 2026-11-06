import type { ResolvedPos, SelectionDetail } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

/** A position the user typed, resolved. */
export type Probe = { pos: number; resolved: ResolvedPos | null; error: string | null };

export type SelectionView = {
  detail: SelectionDetail | null;
  error: string | null;
  probe: Probe | null;
};

export type SelectionSource = {
  state: ReadableAtom<SelectionView>;
  /** The selection, and the probe again (the document may have moved under it). Never rejects. */
  load: () => Promise<void>;
  /** Resolves a position, or clears it with `null`. Never rejects. */
  probe: (pos: number | null) => Promise<void>;
};

export const createSelectionSource = (transport: Transport, id: number): SelectionSource => {
  let view: SelectionView = { detail: null, error: null, probe: null };
  // Replies to an older request of each kind are dropped.
  let loads = 0;
  let probes = 0;
  // The position asked for last: a reload re-resolves it, not the one shown (its reply may be pending).
  let wanted: number | null = null;
  // `view` is the working copy; `state` publishes it.
  const state = atom(view);
  const set = (next: Partial<SelectionView>) => {
    view = { ...view, ...next };
    state.set(view);
  };
  const probe = async (pos: number | null) => {
    const at = ++probes;
    wanted = pos;
    if (pos == null) return set({ probe: null });
    try {
      const resolved = await transport.send({ type: "resolve", id, pos });
      if (at == probes) set({ probe: { pos, resolved, error: null } });
    } catch (e) {
      if (at == probes) set({ probe: { pos, resolved: null, error: errorMessage(e) } });
    }
  };
  return {
    state,
    load: async () => {
      const at = ++loads;
      if (wanted != null) void probe(wanted);
      try {
        const detail = await transport.send({ type: "selectionDetail", id });
        if (at == loads) set({ detail, error: null });
      } catch (e) {
        // The last selection stays up, with the error.
        if (at == loads) set({ error: errorMessage(e) });
      }
    },
    probe,
  };
};
