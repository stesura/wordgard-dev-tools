import { expect, it } from "vitest";
import { accessor } from "../protocol.ts";

it("writes keys as a JS accessor, quoting what isn't an identifier", () => {
  expect(accessor([])).toBe("");
  expect(accessor(["doc", "content", "0", "type"])).toBe(".doc.content[0].type");
  expect(accessor(["$x", "_y", "z9"])).toBe(".$x._y.z9");
  expect(accessor(["a-b", "has space", "9lives", ""])).toBe('["a-b"]["has space"]["9lives"][""]');
  expect(accessor(['say "hi"', "back\\slash"])).toBe('["say \\"hi\\""]["back\\\\slash"]');
  // Not an index: a sign or a fraction.
  expect(accessor(["-1", "1.5"])).toBe('["-1"]["1.5"]');
});
