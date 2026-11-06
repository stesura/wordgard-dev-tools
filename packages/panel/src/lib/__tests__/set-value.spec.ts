import { expect, it } from "vitest";
import { placeOf, readSet } from "../set-value.ts";

it("reads a set as the page sends it", () => {
  expect(
    readSet({
      "[RangeSet]": [
        [1, 3, { a: 1 }],
        [2, 5, "b"],
      ],
    })
  ).toEqual({
    kind: "range",
    entries: [
      { from: 1, to: 3, side: null, value: { a: 1 } },
      { from: 2, to: 5, side: null, value: "b" },
    ],
    more: 0,
    exact: true,
  });
  expect(readSet({ "[PointSet]": [[4, -1, "w"]], more: 10, exact: false })).toEqual({
    kind: "point",
    entries: [{ from: 4, to: 4, side: -1, value: "w" }],
    more: 10,
    exact: false,
  });
  expect(readSet({ "[RangeSet]": [["x"], [1]] })?.entries).toEqual([]);
  expect(readSet([1, 2])).toBeNull();
  expect(readSet({ "[Map]": [] })).toBeNull();
});

it("says where an entry sits", () => {
  expect(placeOf({ from: 1, to: 3, side: null })).toBe("1–3");
  expect(placeOf({ from: 4, to: 4, side: -1 })).toBe("4 (before)");
  expect(placeOf({ from: 4, to: 4, side: 1e9 })).toBe("4 (after)");
  expect(placeOf({ from: 4, to: 4, side: 0 })).toBe("4");
});
