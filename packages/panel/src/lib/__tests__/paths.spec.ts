import { expect, it } from "vitest";
import { isPrefix, itemId, parentOf, pathOf } from "../paths.ts";

it("names paths and their parents", () => {
  expect(itemId([])).toBe("root");
  expect(itemId([1, 0])).toBe("1.0");
  expect(pathOf("root")).toEqual([]);
  expect(pathOf("1.0")).toEqual([1, 0]);
  expect(parentOf("1.0")).toBe("1");
  expect(parentOf("1")).toBe("root");
  expect(parentOf("root")).toBeNull();
  expect(isPrefix([1], [1, 0])).toBe(true);
  expect(isPrefix([1, 0], [1])).toBe(false);
  expect(isPrefix([], [2])).toBe(true);
});
