import { expect, it } from "vitest";
import { preview, toSafe } from "../serialise.ts";

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

it("walks an object whose toJSON needs arguments", () => {
  const value = {
    depth: 2,
    toJSON: (state: { facet: () => number }) => state.facet(),
  };
  expect(toSafe(value)).toEqual({ depth: 2, toJSON: "[Function toJSON]" });
});
