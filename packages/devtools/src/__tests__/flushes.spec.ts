import { expect, it } from "vitest";
import type { Source } from "../decorations.ts";
import { pairSources } from "../flushes.ts";

const source = (kind: Source["kind"] = "point"): Source => ({
  kind,
  fn: () => null,
  builtIn: false,
});

const shape = (pairs: ReturnType<typeof pairSources>, before: Source[], after: Source[]) =>
  pairs.map(({ old, next, index, match }) => ({
    old: old ? before.indexOf(old) : null,
    next: next ? after.indexOf(next) : null,
    index,
    match,
  }));

it("pairs sources by function", () => {
  const [a, b] = [source(), source("range")];
  expect(shape(pairSources([a, b], [b, a]), [a, b], [b, a])).toEqual([
    { old: 1, next: 0, index: 0, match: "same" },
    { old: 0, next: 1, index: 1, match: "same" },
  ]);
});

it("pairs a new function in the same slot when the lists are as long", () => {
  const [a, b, c] = [source(), source(), source()];
  expect(shape(pairSources([a, b], [a, c]), [a, b], [a, c])).toEqual([
    { old: 0, next: 0, index: 0, match: "same" },
    { old: 1, next: 1, index: 1, match: "slot" },
  ]);
});

it("doesn't pair across kinds or lengths", () => {
  const [a, b, c, d] = [source(), source(), source("range"), source()];
  expect(shape(pairSources([a, b], [a, c]), [a, b], [a, c])).toEqual([
    { old: 0, next: 0, index: 0, match: "same" },
    { old: null, next: 1, index: 1, match: "added" },
    { old: 1, next: null, index: 1, match: "removed" },
  ]);
  expect(shape(pairSources([a, b], [a, d, c]), [a, b], [a, d, c])).toEqual([
    { old: 0, next: 0, index: 0, match: "same" },
    { old: null, next: 1, index: 1, match: "added" },
    { old: null, next: 2, index: 2, match: "added" },
    { old: 1, next: null, index: 1, match: "removed" },
  ]);
});

it("matches a function registered twice once per occurrence", () => {
  const a = source();
  const twice = [a, { ...a }];
  expect(shape(pairSources(twice, twice), twice, twice).map((p) => p.match)).toEqual([
    "same",
    "same",
  ]);
});
