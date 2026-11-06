import { expect, it } from "vitest";
import * as wordgardSchema from "wordgard/schema";
import * as wordgardSet from "wordgard/set";
import type { RangeSet } from "wordgard/set";
import * as wordgardState from "wordgard/state";
import { pathIn, preview, toSafe } from "../serialise.ts";

it("copies values safely", () => {
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic.self = cyclic;
  expect(toSafe(cyclic)).toEqual({ a: 1, self: "[Circular]" });
  expect(toSafe({ deep: { deeper: {} } }, 1)).toEqual({ deep: "[Object]" });
  expect(toSafe(new Map([["k", 1]]))).toEqual({ "[Map]": [["k", 1]] });
  expect(toSafe(new Set([1, 2]))).toEqual({ "[Set]": [1, 2] });
  expect(toSafe(new RangeError("bad"))).toEqual({ name: "RangeError", message: "bad" });
  expect(toSafe(new Uint8Array(3))).toBe("[Uint8Array(3 bytes)]");
  expect(toSafe(document.body)).toBe("[BODY]");
  expect(toSafe(() => 1)).toBe("[Function anonymous]");
  expect(toSafe(10n)).toBe("10n");
  expect(toSafe({ toJSON: () => ({ json: true }) })).toEqual({ json: true });
  // Shared, not cyclic: kept twice.
  const shared = { x: 1 };
  expect(toSafe([shared, shared])).toEqual([{ x: 1 }, { x: 1 }]);
});

it("previews values as truncated JSON", () => {
  expect(preview(null)).toBeNull();
  expect(preview("hi")).toBe('"hi"');
  expect(preview({ src: "a".repeat(100) })).toHaveLength(80);
});

const rangeValue = (name: string): RangeSet.Value & { name: string } => ({
  name,
  inclusiveStart: false,
  inclusiveEnd: false,
  eq: () => false,
});

it("copies Wordgard sets as their entries, capped", () => {
  const set = wordgardSet.RangeSet.create([
    [rangeValue("a"), 1, 3],
    [rangeValue("b"), 2, 5],
    [rangeValue("c"), 4, 6],
  ]);
  const entry = (from: number, to: number, name: string) => [
    from,
    to,
    { name, inclusiveStart: false, inclusiveEnd: false, eq: "[Function eq]" },
  ];
  expect(toSafe(set)).toEqual({
    "[RangeSet]": [entry(1, 3, "a"), entry(2, 5, "b"), entry(4, 6, "c")],
  });
  expect(toSafe({ comments: set }, 6, undefined, 1)).toEqual({
    comments: { "[RangeSet]": [entry(1, 3, "a")], more: 2, exact: true },
  });
  expect(toSafe(set, 0)).toBe("[Object]");
  // Counted up to ten times the cap: past that, "at least".
  const many = wordgardSet.RangeSet.create(
    Array.from({ length: 30 }, (_, i): [RangeSet.Value, number, number] => [
      rangeValue("v"),
      i,
      i + 1,
    ])
  );
  expect(toSafe(many, 6, undefined, 1)).toMatchObject({ more: 9, exact: false });
  const points = wordgardSet.PointSet.create([
    [{ side: -1, trackMode: undefined, eq: () => false }, 4],
  ]);
  expect(toSafe(points, 1)).toEqual({ "[PointSet]": [[4, -1, "[Object]"]] });
  expect(preview(set)).toBe("RangeSet(3)");
  expect(preview(wordgardSet.PointSet.empty)).toBe("PointSet(0)");
});

it("finds the node a position falls in, or none outside the document", () => {
  const doc = wordgardState.GardState.create({
    doc: "<p>ab</p><p>cd</p>",
    config: [wordgardSchema.basicSchema()],
  }).doc;
  expect(pathIn(doc, 0)).toEqual([]);
  expect(pathIn(doc, 2)).toEqual([0, 0]);
  expect(pathIn(doc, 4)).toEqual([]);
  expect(pathIn(doc, -1)).toBeNull();
  expect(pathIn(doc, doc.length + 1)).toBeNull();
  expect(pathIn(doc, 1.5)).toBeNull();
});

it("walks an object whose toJSON needs arguments", () => {
  const value = {
    depth: 2,
    toJSON: (state: { facet: () => number }) => state.facet(),
  };
  expect(toSafe(value)).toEqual({ depth: 2, toJSON: "[Function toJSON]" });
});
