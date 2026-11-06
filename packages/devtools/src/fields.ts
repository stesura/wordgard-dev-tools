import type { Wordgard } from "wordgard/editor";
import type { GardState, Transaction } from "wordgard/state";
import * as wordgardState from "wordgard/state";
import type { Plot } from "wordgard/doc";
import type {
  FieldChange,
  FieldChangeDetail,
  FieldDetail,
  FieldInfo,
  FieldsInfo,
  SetEntry,
  SetVerdict,
} from "./protocol.ts";
import type { Entry, Registry } from "./registry.ts";
import { pathIn, preview, toSafe } from "./serialise.ts";
import { asSet, compareSets, verdictOf, type SetItem } from "./sets.ts";

// Loaded with the serialisers, on the first panel request.

/** Changes kept per field. */
export const HISTORY = 50;
/** Added and dropped entries a set change's detail sends. */
const SET_ITEMS = 50;

type Field = GardState.Field<unknown>;
/** `set`: its verdict when the field holds a set, computed once (undefined until then). */
type Change = { seq: number; tr: Transaction; value: unknown; set?: SetVerdict | null };
/** `watching`: the panels (by client) showing the Fields tab. */
type Tracked = { watching: Set<string>; history: Map<Field, Change[]> };

/**
 * The state fields of a configuration, in extension order, found by walking its extensions:
 * arrays, Wordgard's precedence and compartment wrappers (their `inner`; a compartment's current
 * content), objects with an `extension`. Fields that only a facet or another field provides
 * aren't reachable this way.
 */
const findFields = (state: GardState): Field[] => {
  const found: Field[] = [];
  const seen = new Set<unknown>();
  const walk = (ext: unknown) => {
    if (typeof ext != "object" || ext == null || seen.has(ext)) return;
    seen.add(ext);
    if (ext instanceof wordgardState.GardState.Field) found.push(ext);
    else if (Array.isArray(ext)) ext.forEach(walk);
    else if (
      "compartment" in ext &&
      ext.compartment instanceof wordgardState.GardState.Compartment
    ) {
      walk(ext.compartment.get(state) ?? ("inner" in ext ? ext.inner : null));
    } else if ("inner" in ext) walk(ext.inner);
    else if ("extension" in ext) walk(ext.extension);
  };
  walk(state.config.base);
  return found;
};

const byConfig = new WeakMap<GardState.Configuration, Field[]>();
const fieldsOf = (state: GardState) => {
  let found = byConfig.get(state.config);
  if (!found) {
    found = findFields(state);
    byConfig.set(state.config, found);
  }
  return found;
};

export type FieldTracker = {
  /** From the agent's update listener, for attached editors. */
  updated: (entry: Entry, update: Wordgard.Update) => void;
  watch: (entry: Entry, client: string, on: boolean) => void;
  watching: (entry: Entry, client: string) => boolean;
  list: (entry: Entry) => FieldsInfo;
  detail: (entry: Entry, index: number) => FieldDetail;
  /** The value a change in the field's history set; for a set, what it added and dropped. */
  changeDetail: (entry: Entry, index: number, seq: number) => FieldChangeDetail;
  /** Logs the field's live value in the page's console, the value a change set, or its whole history. */
  log: (entry: Entry, index: number, seq?: number, history?: boolean) => void;
  /** Forgets the changes seen to one field. */
  clearHistory: (entry: Entry, index?: number) => void;
  /** Drops the history of editors that left the registry. */
  prune: () => void;
};

export const createFieldTracker = (
  registry: Registry,
  /** A transaction's index in the log, when it's there. */
  logIndex: (entry: Entry, tr: Transaction) => number | null
): FieldTracker => {
  const tracked = new Map<Entry, Tracked>();
  let seq = 0;
  const trackedOf = (entry: Entry) => {
    let found = tracked.get(entry);
    if (!found) {
      found = { watching: new Set(), history: new Map() };
      tracked.set(entry, found);
    }
    return found;
  };
  const tracking = (entry: Entry) =>
    entry.recording || (tracked.get(entry)?.watching.size ?? 0) > 0;

  // Against the transaction's start state, not the previous change: that one may be gone (the
  // cap, a clear) or not seen.
  const compared = (field: Field, { tr, value }: Change, items = 0) => {
    const before = asSet(tr.startState.field(field, false));
    const after = asSet(value);
    return before && after ? compareSets(before, after, tr.changes, items) : null;
  };

  const setVerdict = (field: Field, c: Change): SetVerdict | null => {
    if (c.set === undefined) {
      const found = compared(field, c);
      c.set = found && verdictOf(found);
    }
    return c.set;
  };

  const change = (entry: Entry, field: Field, c: Change): FieldChange => ({
    seq: c.seq,
    time: c.tr.annotation(wordgardState.Transaction.time) ?? 0,
    log: logIndex(entry, c.tr),
    preview: preview(c.value),
    set: setVerdict(field, c),
  });

  /** `doc`: where to find its node, when that's the document the Structure shows. */
  const entryOf =
    (doc: Plot.Doc | null) =>
    ({ from, to, side, value }: SetItem): SetEntry => ({
      from,
      to,
      side,
      value: preview(value),
      path: doc && pathIn(doc, from),
    });

  const info = (entry: Entry, fields: Field[], index: number): FieldInfo => {
    const field = fields[index];
    if (!field) throw new Error(`No field ${index}`);
    const named = Object.entries(entry.fields ?? {}).find(([, f]) => f == field)?.[0];
    const history = tracked.get(entry)?.history.get(field) ?? [];
    const last = history.at(-1);
    return {
      index,
      name: named ?? `field #${index + 1}`,
      named: named != null,
      preview: preview(entry.wg.state.field(field, false)),
      changes: history.length,
      last: last ? change(entry, field, last) : null,
    };
  };

  const changeOf = (entry: Entry, index: number, seq: number) => {
    const field = fieldsOf(entry.wg.state)[index];
    if (!field) throw new Error(`No field ${index}`);
    const found = tracked
      .get(entry)
      ?.history.get(field)
      ?.find((c) => c.seq == seq);
    if (!found) throw new Error("That change is no longer in the history");
    return { field, change: found };
  };

  return {
    updated: (entry, update) => {
      if (!tracking(entry)) return;
      const { history } = trackedOf(entry);
      for (const tr of update.transactions) {
        for (const field of fieldsOf(tr.state)) {
          const value = tr.state.field(field, false);
          let set: SetVerdict | undefined;
          if (tr.startState.field(field, false) === value) {
            // A set kept as is across a change that moved what it holds: it wasn't mapped.
            const kept = tr.docChanged ? asSet(value) : null;
            const found = kept && compareSets(kept, kept, tr.changes);
            if (found?.verdict != "moved") continue;
            set = verdictOf(found);
          }
          let changes = history.get(field);
          if (!changes) history.set(field, (changes = []));
          changes.push({ seq: ++seq, tr, value, set });
          if (changes.length > HISTORY) changes.shift();
        }
      }
    },
    watch: (entry, client, on) => {
      const { watching } = trackedOf(entry);
      if (on) watching.add(client);
      else watching.delete(client);
    },
    watching: (entry, client) => tracked.get(entry)?.watching.has(client) ?? false,
    list: (entry) => {
      const fields = fieldsOf(entry.wg.state);
      return {
        tracking: tracking(entry),
        fields: fields.map((_, index) => info(entry, fields, index)),
      };
    },
    detail: (entry, index) => {
      const fields = fieldsOf(entry.wg.state);
      const base = info(entry, fields, index);
      const field = fields[index];
      const history = (field && tracked.get(entry)?.history.get(field)) || [];
      return {
        ...base,
        value: toSafe(field && entry.wg.state.field(field, false)),
        history: field ? history.map((c) => change(entry, field, c)) : [],
      };
    },
    changeDetail: (entry, index, seq) => {
      const { field, change: c } = changeOf(entry, index, seq);
      const found = compared(field, c, SET_ITEMS);
      return {
        value: toSafe(c.value),
        set: found && {
          ...verdictOf(found),
          // Linked only while their document is the one shown: dropped entries are in an older one.
          addedEntries: found.addedItems.map(
            entryOf(c.tr.state.doc === entry.wg.state.doc ? c.tr.state.doc : null)
          ),
          droppedEntries: found.droppedItems.map(entryOf(null)),
        },
      };
    },
    log: (entry, index, seq, history) => {
      const fields = fieldsOf(entry.wg.state);
      const field = fields[index];
      if (!field) throw new Error(`No field ${index}`);
      const name = info(entry, fields, index).name;
      if (history) {
        const changes = tracked.get(entry)?.history.get(field) ?? [];
        console.log(
          `[wordgard-devtools] ${name}, history (newest first)`,
          [...changes].reverse().map(({ tr, value }) => ({
            transaction: logIndex(entry, tr),
            time: tr.annotation(wordgardState.Transaction.time) ?? 0,
            value,
          }))
        );
        return;
      }
      if (seq == null) {
        console.log(`[wordgard-devtools] ${name}`, entry.wg.state.field(field, false));
        return;
      }
      const found = changeOf(entry, index, seq).change;
      const at = logIndex(entry, found.tr);
      console.log(
        `[wordgard-devtools] ${name}, as set by ${at == null ? "a transaction" : `transaction #${at}`}`,
        found.value
      );
    },
    clearHistory: (entry, index) => {
      if (index == null) {
        tracked.get(entry)?.history.clear();
        return;
      }
      const field = fieldsOf(entry.wg.state)[index];
      if (!field) throw new Error(`No field ${index}`);
      tracked.get(entry)?.history.delete(field);
    },
    prune: () => {
      for (const entry of tracked.keys())
        if (registry.editors.get(entry.wg) != entry) tracked.delete(entry);
    },
  };
};
