import { expect, it } from "vitest";
import { pressedIn, tagsOf } from "../schema-filters.ts";

it("lists the types' tags, and the pressed ones this schema has", () => {
  expect(tagsOf([{ t: ["a", "b"] }, { t: ["b", "c"] }], (type) => type.t)).toEqual(["a", "b", "c"]);
  // A saved tag this schema doesn't have isn't pressed.
  expect([...pressedIn(new Set(["a", "gone"]), ["a", "b"])]).toEqual(["a"]);
});
