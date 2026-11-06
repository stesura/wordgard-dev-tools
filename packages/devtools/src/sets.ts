import type { ChangeSet } from "wordgard/doc";
import type { PointSet, RangeSet } from "wordgard/set";
import * as wordgardSet from "wordgard/set";
import type { SetVerdict } from "./protocol.ts";

// Loaded with the serialisers, on the first panel request.

/** A Wordgard point or range set, with its kind. */
export type TypedSet =
  | { kind: "point"; set: PointSet<PointSet.Value> }
  | { kind: "range"; set: RangeSet<RangeSet.Value> };

/** One of a set's values where it sits: a point has `from == to` and a side. */
export type SetItem = { from: number; to: number; side: number | null; value: unknown };

/** Entries walked when comparing two sets; past it, counts are partial. */
export const COMPARE_LIMIT = 20_000;
/** Changed ranges sent per comparison. */
const CHANGED_RANGES = 50;

/** The value as a set, or null. Guarded: a Wordgard without `wordgard/set`'s classes has none. */
export const asSet = (value: unknown): TypedSet | null => {
  const { PointSet, RangeSet } = wordgardSet;
  if (typeof PointSet == "function" && value instanceof PointSet)
    return { kind: "point", set: value };
  if (typeof RangeSet == "function" && value instanceof RangeSet)
    return { kind: "range", set: value };
  return null;
};

/**
 * A set's entries in order, through its cursor (a range set's layers merged), up to `cap`; the
 * rest counted up to `count` entries in all (`exact: false` past it).
 */
export const walkSet = (
  typed: TypedSet,
  cap: number,
  count = Math.max(cap, 1) * 10
): { items: SetItem[]; total: number; exact: boolean } => {
  const items: SetItem[] = [];
  let total = 0;
  if (typed.kind == "point") {
    const cur = typed.set.cursor();
    for (; cur.value != null; cur.next()) {
      if (total == count) return { items, total, exact: false };
      if (total++ < cap)
        items.push({ from: cur.from, to: cur.from, side: cur.value.side, value: cur.value });
    }
  } else {
    const cur = typed.set.cursor();
    for (; cur.value != null; cur.next()) {
      if (total == count) return { items, total, exact: false };
      if (total++ < cap) items.push({ from: cur.from, to: cur.to, side: null, value: cur.value });
    }
  }
  return { items, total, exact: true };
};

/** Same entries, in the same places, by value identity. Null when either has more than the limit. */
const sameItems = (a: TypedSet, b: TypedSet): boolean | null => {
  const left = walkSet(a, COMPARE_LIMIT, COMPARE_LIMIT);
  const right = walkSet(b, COMPARE_LIMIT, COMPARE_LIMIT);
  if (!left.exact || !right.exact) return null;
  return (
    left.items.length == right.items.length &&
    left.items.every((item, i) => {
      const other = right.items[i];
      return (
        other != null &&
        item.value === other.value &&
        item.from == other.from &&
        item.to == other.to
      );
    })
  );
};

const mapped = (typed: TypedSet, changes: ChangeSet): TypedSet =>
  typed.kind == "point"
    ? { kind: "point", set: typed.set.map(changes) }
    : { kind: "range", set: typed.set.map(changes) };

/**
 * Where two sets differ for the editor: its own comparison, over the gaps the changes left
 * (changed ranges are redrawn anyway). Positions in the new document. Null when the values can't
 * be compared (`compareRange` calls their `eq`, which app values may lack).
 */
const changedRanges = (old: TypedSet, next: TypedSet, changes: ChangeSet) => {
  // A range set's layers are compared one after another: sorted and merged at the end.
  const found: { from: number; to: number }[] = [];
  const add = (from: number, to: number) => {
    if (found.length < COMPARE_LIMIT) found.push({ from, to });
  };
  try {
    changes.iterGaps((fromA, toA, fromB) => {
      if (old.kind == "point" && next.kind == "point")
        old.set.compareRange(fromA, next.set, fromB, toA - fromA, (pos) => add(pos, pos));
      else if (old.kind == "range" && next.kind == "range")
        old.set.compareRange(fromA, next.set, fromB, toA - fromA, add);
    });
  } catch {
    return null;
  }
  found.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: { from: number; to: number }[] = [];
  for (const range of found) {
    const last = merged.at(-1);
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return { count: merged.length, ranges: merged.slice(0, CHANGED_RANGES) };
};

export type SetComparison = SetVerdict & { addedItems: SetItem[]; droppedItems: SetItem[] };

/** The verdict alone, without the entries. */
export const verdictOf = ({
  addedItems: _a,
  droppedItems: _d,
  ...verdict
}: SetComparison): SetVerdict => verdict;

/**
 * How a set changed through `changes`: the same set (nothing it holds moved), the same set kept
 * across a change that moved its positions, a new one sharing values (by identity, counted by
 * position) or sharing none. Null when they aren't sets of one kind. `items`: added and dropped
 * entries kept, at most.
 */
export const compareSets = (
  old: TypedSet,
  next: TypedSet,
  changes: ChangeSet,
  items = 0
): SetComparison | null => {
  if (old.kind != next.kind) return null;
  const base = {
    kind: old.kind,
    kept: 0,
    added: 0,
    dropped: 0,
    partial: false,
    changed: { count: 0, ranges: [] },
    addedItems: [],
    droppedItems: [],
  };
  if (old.set === next.set) {
    if (old.set.empty || changes.empty) return { ...base, verdict: "same" };
    let same: boolean | null;
    try {
      same = sameItems(mapped(old, changes), old);
    } catch {
      // Its positions don't fit the document it was kept for.
      same = false;
    }
    return { ...base, verdict: same === false ? "moved" : "same", partial: same == null };
  }
  const before = walkSet(old, COMPARE_LIMIT, COMPARE_LIMIT);
  const after = walkSet(next, COMPARE_LIMIT, COMPARE_LIMIT);
  // Old entries by value: each new entry holding one of them keeps it.
  const pool = new Map<unknown, SetItem[]>();
  for (const item of before.items) {
    const list = pool.get(item.value);
    if (list) list.push(item);
    else pool.set(item.value, [item]);
  }
  let kept = 0;
  const added: SetItem[] = [];
  for (const item of after.items) {
    if (pool.get(item.value)?.pop()) kept++;
    else added.push(item);
  }
  const dropped = [...pool.values()].flat().sort((a, b) => a.from - b.from || a.to - b.to);
  const empty = !before.items.length || !after.items.length;
  return {
    kind: old.kind,
    verdict:
      !before.items.length && !after.items.length
        ? "same"
        : kept || empty
          ? "updated"
          : "recreated",
    kept,
    added: added.length,
    dropped: dropped.length,
    partial: !before.exact || !after.exact,
    changed: changedRanges(old, next, changes),
    addedItems: added.slice(0, items),
    droppedItems: dropped.slice(0, items),
  };
};
