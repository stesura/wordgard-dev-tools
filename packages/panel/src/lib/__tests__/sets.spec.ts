import { expect, it } from "vitest";
import { toggled } from "../sets.ts";

it("adds a value, or removes it if it was there", () => {
  expect([...toggled(new Set(["a"]), "a")]).toEqual([]);
  expect([...toggled(new Set(["a"]), "b")]).toEqual(["a", "b"]);
});
