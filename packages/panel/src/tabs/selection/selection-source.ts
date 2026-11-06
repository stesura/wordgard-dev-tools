import type { ResolvedPos, SelectionDetail } from "@stesura/wordgard-dev-tools";
import { atom, type ReadableAtom } from "nanostores";
import { createResource, type ResourceSource } from "#stores/resource.ts";
import { errorMessage } from "#lib/json.ts";
import type { Transport } from "../../transport.ts";

/** A position the user typed, resolved. */
export type Probe = { pos: number; resolved: ResolvedPos | null; error: string | null };

export type SelectionSource = ResourceSource<SelectionDetail> & {
  /** The position typed last, resolved. */
  probed: ReadableAtom<Probe | null>;
  /** Resolves a position, or clears it with `null`. Never rejects. */
  probe: (pos: number | null) => Promise<void>;
};

export const createSelectionSource = (transport: Transport, id: number): SelectionSource => {
  const selection = createResource(() => transport.send({ type: "selectionDetail", id }));
  const probed = atom<Probe | null>(null);
  // Replies to an older probe are dropped.
  let probes = 0;
  // The position asked for last: a reload re-resolves it, not the one shown (its reply may be pending).
  let wanted: number | null = null;
  const probe = async (pos: number | null) => {
    const at = ++probes;
    wanted = pos;
    if (pos == null) return probed.set(null);
    try {
      const resolved = await transport.send({ type: "resolve", id, pos });
      if (at == probes) probed.set({ pos, resolved, error: null });
    } catch (e) {
      if (at == probes) probed.set({ pos, resolved: null, error: errorMessage(e) });
    }
  };
  return {
    ...selection,
    probed,
    // The probe again too: the document may have moved under it.
    load: () => {
      if (wanted != null) void probe(wanted);
      return selection.load();
    },
    probe,
  };
};
