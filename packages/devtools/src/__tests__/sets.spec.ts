import { expect, it } from "vitest";
import * as wordgardDoc from "wordgard/doc";
import * as wordgardSchema from "wordgard/schema";
import * as wordgardSet from "wordgard/set";
import type { PointSet, RangeSet } from "wordgard/set";
import * as wordgardState from "wordgard/state";
import * as wordgardTypes from "wordgard/types";
import { COMPARE_LIMIT, asSet, compareSets, walkSet, type TypedSet } from "../sets.ts";

// Values equal by name, as most decorations are by content.
type Named = RangeSet.Value & { name: string };
const named = (name: string): Named => {
  const value: Named = {
    name,
    inclusiveStart: false,
    inclusiveEnd: false,
    eq: (other) => "name" in other && other.name == name,
  };
  return value;
};
type Point = PointSet.Value & { name: string };
const point = (name: string, side = 0): Point => {
  const value: Point = {
    name,
    side,
    trackMode: undefined,
    eq: (other) => "name" in other && other.name == name,
  };
  return value;
};

const ranges = (...entries: [Named, number, number][]): TypedSet => ({
  kind: "range",
  set: wordgardSet.RangeSet.create<RangeSet.Value>(entries),
});

// "<p>abcdef</p>": the text runs from 1 to 7.
const state = wordgardState.GardState.create({
  doc: "<p>abcdef</p>",
  config: [wordgardSchema.basicSchema()],
});
const insertAt = (pos: number) =>
  state.update({ changes: { from: pos, insert: [wordgardDoc.Leaf.text("XY")] } }).changes;

it("knows a set from anything else", () => {
  expect(asSet(wordgardSet.RangeSet.empty)?.kind).toBe("range");
  expect(asSet(wordgardSet.PointSet.empty)?.kind).toBe("point");
  expect(asSet([])).toBeNull();
  expect(asSet(null)).toBeNull();
});

it("walks a set's entries in order, up to a cap, counting the rest up to a bound", () => {
  const a = named("a");
  const b = named("b");
  const c = named("c");
  const set = ranges([a, 1, 3], [b, 2, 5], [c, 4, 6]);
  expect(walkSet(set, 10)).toEqual({
    items: [
      { from: 1, to: 3, side: null, value: a },
      { from: 2, to: 5, side: null, value: b },
      { from: 4, to: 6, side: null, value: c },
    ],
    total: 3,
    exact: true,
  });
  expect(walkSet(set, 1)).toMatchObject({ items: [{ value: a }], total: 3, exact: true });
  expect(walkSet(set, 1, 2)).toMatchObject({ total: 2, exact: false });
  const p = point("p", -1);
  expect(
    walkSet({ kind: "point", set: wordgardSet.PointSet.create<PointSet.Value>([[p, 4]]) }, 10).items
  ).toEqual([{ from: 4, to: 4, side: -1, value: p }]);
});

it("finds a mapped set updated, with what the editor redraws", () => {
  const a = named("a");
  const b = named("b");
  const old = ranges([a, 2, 3], [b, 5, 6]);
  const changes = insertAt(4);
  if (old.kind != "range") throw new Error("range");
  const next: TypedSet = { kind: "range", set: old.set.map(changes) };
  expect(compareSets(old, next, changes)).toMatchObject({
    verdict: "updated",
    kept: 2,
    added: 0,
    dropped: 0,
    changed: { count: 0, ranges: [] },
  });
  const c = named("c");
  const modified: TypedSet = { kind: "range", set: next.set.modify({ add: [[c, 1, 2]] }) };
  expect(compareSets(old, modified, changes, 5)).toMatchObject({
    verdict: "updated",
    kept: 2,
    added: 1,
    addedItems: [{ from: 1, to: 2, value: c }],
    changed: { count: 1, ranges: [{ from: 1, to: 2 }] },
  });
});

it("finds a set recreated, and a recreation the editor doesn't see", () => {
  const old = ranges([named("a"), 2, 3]);
  const changes = insertAt(1);
  // Equal values, in their mapped place: nothing to redraw.
  expect(compareSets(old, ranges([named("a"), 4, 5]), changes)).toMatchObject({
    verdict: "recreated",
    kept: 0,
    added: 1,
    dropped: 1,
    changed: { count: 0 },
  });
  expect(compareSets(old, ranges([named("b"), 4, 5]), changes)).toMatchObject({
    verdict: "recreated",
    changed: { count: 1, ranges: [{ from: 4, to: 5 }] },
  });
});

it("counts a set emptied or first filled as updated", () => {
  const changes = insertAt(1);
  const empty: TypedSet = { kind: "range", set: wordgardSet.RangeSet.empty };
  expect(compareSets(ranges([named("a"), 2, 3]), empty, changes)).toMatchObject({
    verdict: "updated",
    dropped: 1,
  });
  expect(compareSets(empty, ranges([named("a"), 2, 3]), changes)).toMatchObject({
    verdict: "updated",
    added: 1,
  });
});

it("flags the same set kept across a change that moved it, and only then", () => {
  const set = ranges([named("a"), 3, 4]);
  expect(compareSets(set, set, insertAt(1))).toMatchObject({ verdict: "moved" });
  // After its entries: nothing moved.
  expect(compareSets(set, set, insertAt(6))).toMatchObject({ verdict: "same" });
  // A mark changes the document but moves no position.
  const marked = state.update({ changes: { from: 1, to: 3, add: wordgardTypes.Strong } });
  expect(marked.docChanged).toBe(true);
  expect(compareSets(set, set, marked.changes)).toMatchObject({ verdict: "same" });
  const empty: TypedSet = { kind: "range", set: wordgardSet.RangeSet.empty };
  expect(compareSets(empty, empty, insertAt(1))).toMatchObject({ verdict: "same" });
});

it("doesn't fail on values it can't compare, or sets of two kinds", () => {
  // As an app value without `eq` fails when compared.
  const plain = (): RangeSet.Value => ({
    inclusiveStart: false,
    inclusiveEnd: false,
    eq: () => {
      throw new TypeError("value.eq is not a function");
    },
  });
  const old: TypedSet = { kind: "range", set: wordgardSet.RangeSet.create([[plain(), 2, 3]]) };
  const next: TypedSet = { kind: "range", set: wordgardSet.RangeSet.create([[plain(), 2, 3]]) };
  expect(compareSets(old, next, insertAt(6))).toMatchObject({
    verdict: "recreated",
    changed: null,
  });
  expect(
    compareSets(old, { kind: "point", set: wordgardSet.PointSet.empty }, insertAt(1))
  ).toBeNull();
});

it("compares point sets", () => {
  const p = point("p", -1);
  const old: TypedSet = {
    kind: "point",
    set: wordgardSet.PointSet.create<PointSet.Value>([[p, 3]]),
  };
  const changes = insertAt(1);
  if (old.kind != "point") throw new Error("point");
  expect(compareSets(old, old, changes)).toMatchObject({ verdict: "moved" });
  const next: TypedSet = { kind: "point", set: old.set.map(changes) };
  expect(compareSets(old, next, changes)).toMatchObject({
    verdict: "updated",
    kept: 1,
    changed: { count: 0 },
  });
  const other: TypedSet = {
    kind: "point",
    set: wordgardSet.PointSet.create<PointSet.Value>([[point("q", -1), 5]]),
  };
  expect(compareSets(old, other, changes)).toMatchObject({
    verdict: "recreated",
    changed: { count: 1, ranges: [{ from: 5, to: 5 }] },
  });
});

it("merges what differs across a range set's layers", () => {
  // Overlapping ranges sit in two layers; both change.
  const old = ranges([named("a"), 2, 6], [named("b"), 3, 5]);
  const next = ranges([named("c"), 2, 6], [named("d"), 3, 5]);
  expect(compareSets(old, next, insertAt(7))).toMatchObject({
    changed: { count: 1, ranges: [{ from: 2, to: 6 }] },
  });
});

it("flags a kept set whose positions don't fit the document", () => {
  const stale = ranges([named("a"), 20, 30]);
  expect(compareSets(stale, stale, insertAt(1))).toMatchObject({ verdict: "moved" });
});

it("marks counts partial past the walk's limit", () => {
  const entries: [Named, number, number][] = Array.from({ length: COMPARE_LIMIT + 1 }, (_, i) => [
    named(String(i)),
    i,
    i + 1,
  ]);
  const big = ranges(...entries);
  expect(compareSets(big, ranges([named("x"), 1, 2]), insertAt(1))).toMatchObject({
    partial: true,
  });
});
