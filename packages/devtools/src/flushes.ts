import type { ChangeSet } from "wordgard/doc";
import type { GardState, Transaction } from "wordgard/state";
import * as wordgardSet from "wordgard/set";
import { sourceLabel, sourceName, sourcesOf, type Source } from "./decorations.ts";
import type { DecorationSummary, FlushDecorations, FlushSource } from "./protocol.ts";
import { pathIn } from "./serialise.ts";
import {
  COMPARE_LIMIT,
  asSet,
  compareSets,
  redrawn,
  verdictOf,
  type SetItem,
  type TypedSet,
} from "./sets.ts";

// Loaded with the serialisers, on the first panel request. The editor calls the decoration
// sources once per flush, and compares what they return with the sets it last drew over the gaps
// the flush's changes left: so does this, from the flush's first start state to its last state.

/** A flush's recorded transactions, in order, with their log indices. */
export type FlushItem = { index: number; tr: Transaction };

type Pair = { old: Source | null; next: Source | null; index: number; match: FlushSource["match"] };

/**
 * Sources across two states, by function; a function left over in each, in the same place and of
 * one kind, pairs as a new function in the same slot when both lists are as long.
 */
export const pairSources = (before: Source[], after: Source[]): Pair[] => {
  const used = new Set<Source>();
  const matched = after.map((next) => {
    const old = before.find((s) => s.fn === next.fn && !used.has(s)) ?? null;
    if (old) used.add(old);
    return old;
  });
  const sameLength = before.length == after.length;
  const pairs = after.map((next, index): Pair => {
    const old = matched[index];
    if (old) return { old, next, index, match: "same" };
    const slot = before[index];
    if (sameLength && slot && !used.has(slot) && slot.kind == next.kind) {
      used.add(slot);
      return { old: slot, next, index, match: "slot" };
    }
    return { old: null, next, index, match: "added" };
  });
  before.forEach((old, index) => {
    if (!used.has(old)) pairs.push({ old, next: null, index, match: "removed" });
  });
  return pairs;
};

type Called = { typed: TypedSet | null; ms: number | null; error: string | null };

const call = (source: Source, state: GardState): Called => {
  const start = performance.now();
  try {
    const typed = asSet(source.fn(state));
    const ms = performance.now() - start;
    return typed ? { typed, ms, error: null } : { typed, ms, error: "It didn't return a set" };
  } catch (e) {
    return { typed: null, ms: null, error: e instanceof Error ? e.message : String(e) };
  }
};

/** An empty set of a kind: what the editor compares an added or removed source's set with. */
const emptyOf = (kind: "point" | "range") =>
  asSet(kind == "point" ? wordgardSet.PointSet?.empty : wordgardSet.RangeSet?.empty);

/** The old set mapped through the changes and the new one hold the same, by position and `eq`. Null when they can't be compared. */
const sameAsMapped = (old: TypedSet, next: TypedSet, changes: ChangeSet, length: number) => {
  let differs = false;
  const differ = () => {
    differs = true;
  };
  try {
    if (old.kind == "point" && next.kind == "point")
      old.set.map(changes).compareRange(0, next.set, 0, length, differ);
    else if (old.kind == "range" && next.kind == "range")
      old.set.map(changes).compareRange(0, next.set, 0, length, differ);
    else return null;
  } catch {
    return null;
  }
  return !differs;
};

/** The top-level blocks the changes touched, in the new document. */
const changedBlocks = (end: GardState, changes: ChangeSet) => {
  const blocks: { from: number; to: number }[] = [];
  const { doc } = end;
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    // Widened by one: a deletion is a point, between or inside blocks.
    doc.iterate(Math.max(0, fromB - 1), Math.min(doc.length, toB + 1), (node, pos) => {
      blocks.push({ from: pos, to: pos + node.length });
      return false;
    });
  });
  return blocks;
};

/**
 * A new entry outside every block the changes touched: rebuilt where a map would do. Inside them
 * it's an incremental rebuild (`decoratePlots` recreates the plots a change falls in).
 */
const rebuiltOutside = (added: SetItem[], blocks: { from: number; to: number }[]) =>
  added.some(
    ({ from, to }) =>
      // A point at a block's end applies to what follows it.
      !blocks.some((block) => block.from <= from && (from == to ? from < block.to : to <= block.to))
  );

const verdict = (
  pair: Pair,
  start: GardState,
  end: GardState,
  changes: ChangeSet,
  blocks: () => { from: number; to: number }[]
): FlushSource => {
  const shown = pair.next ?? pair.old;
  const base = {
    index: pair.index,
    kind: shown?.kind ?? "point",
    name: shown ? sourceName(shown) : null,
    builtIn: shown?.builtIn ?? false,
    match: pair.match,
    set: null,
    changed: [],
    wasted: false,
    ms: null,
    error: null,
  };
  if (!shown) return base;
  const before = pair.old ? call(pair.old, start) : { typed: emptyOf(shown.kind), error: null };
  const after = pair.next
    ? call(pair.next, end)
    : { typed: emptyOf(shown.kind), ms: null, error: null };
  const error = before.error ?? after.error;
  if (error != null || !before.typed || !after.typed) return { ...base, error };
  const compared = compareSets(before.typed, after.typed, changes, COMPARE_LIMIT);
  const empty = emptyOf(shown.kind);
  if (!compared || !empty) return { ...base, error: "Its sets aren't of one kind" };
  const { addedItems } = compared;
  const rebuilt = compared.verdict == "updated" || compared.verdict == "recreated";
  // The editor pairs sets by function: a new one in the slot redraws both sets whole.
  const set =
    pair.match == "slot"
      ? {
          ...verdictOf(compared),
          changed: redrawn(
            [
              [before.typed, empty],
              [empty, after.typed],
            ],
            changes
          ),
        }
      : verdictOf(compared);
  return {
    ...base,
    set,
    changed: (set.changed?.ranges ?? []).map((range) => ({
      ...range,
      path: pathIn(end.doc, range.from),
    })),
    // Wordgard's node selection rebuilds its one point on each call: cheaper than mapping it.
    // Across a document change, a map isn't waste, nor a rebuild of what the changes touched.
    wasted:
      rebuilt &&
      !shown.builtIn &&
      pair.match == "same" &&
      set.changed?.count === 0 &&
      sameAsMapped(before.typed, after.typed, changes, end.doc.length) === true &&
      (changes.empty || rebuiltOutside(addedItems, blocks())),
    ms: rebuilt ? after.ms : null,
  };
};

/** The flush's changes, composed; null when its transactions don't chain (one wasn't recorded). */
const composed = (items: FlushItem[]) => {
  let changes: ChangeSet | null = null;
  let last: Transaction | null = null;
  for (const { tr } of items) {
    if (last && last.state.doc !== tr.startState.doc) return null;
    changes = changes ? changes.compose(tr.changes) : tr.changes;
    last = tr;
  }
  return changes;
};

/** What a flush did to each source. `before`: the recorded transaction before its first. */
export const flushDecorations = (
  flush: number,
  items: FlushItem[],
  before: Transaction | null
): FlushDecorations => {
  const first = items[0]?.tr;
  const last = items.at(-1)?.tr;
  const base = {
    flush,
    rows: items.map((item) => item.index),
    gapBefore: before != null && first != null && before.state !== first.startState,
    error: null,
    sources: [],
  };
  if (!first || !last) return base;
  let changes: ChangeSet | null;
  try {
    changes = composed(items);
  } catch {
    changes = null;
  }
  if (!changes)
    return {
      ...base,
      error: "A transaction in this flush wasn't recorded: its changes are unknown",
    };
  const { startState: start } = first;
  const { state: end } = last;
  let blocks: { from: number; to: number }[] | null = null;
  const touched = () => (blocks ??= changedBlocks(end, changes));
  return {
    ...base,
    sources: pairSources(sourcesOf(start), sourcesOf(end)).map((pair) =>
      verdict(pair, start, end, changes, touched)
    ),
  };
};

export const summaryOf = ({ sources }: FlushDecorations): DecorationSummary => ({
  wasted: sources.filter((s) => s.wasted).length,
  updated: sources.filter((s) => s.set?.verdict == "updated").length,
  recreated: sources.filter((s) => s.set?.verdict == "recreated").length,
  notMapped: sources.filter((s) => s.set?.verdict == "moved").length,
});

/** Logs each source's sets before and after the flush, live. */
export const logFlushDecorations = (flush: number, items: FlushItem[]) => {
  const first = items[0]?.tr;
  const last = items.at(-1)?.tr;
  if (!first || !last) throw new Error(`Flush #${flush} has no recorded transactions`);
  const { startState: start } = first;
  const { state: end } = last;
  const value = (source: Source | null, state: GardState) => {
    if (!source) return undefined;
    try {
      return source.fn(state);
    } catch (e) {
      return e;
    }
  };
  const sources = pairSources(sourcesOf(start), sourcesOf(end)).map(
    ({ old, next, index, match }) => {
      const shown = next ?? old;
      return {
        source: shown ? sourceLabel(shown, index) : `source #${index + 1}`,
        match,
        fn: shown?.fn,
        before: value(old, start),
        after: value(next, end),
      };
    }
  );
  console.log(`[wordgard-devtools] flush #${flush}, decoration sources before and after`, sources);
};
