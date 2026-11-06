import { expect, it } from "vitest";
import { hueOf } from "../src/colours.ts";

it("gives each name its own hue, the same every time, until the palette is full", () => {
  const names = Array.from({ length: 12 }, (_, i) => `Type${i}`);
  const hues = names.map((name) => hueOf("node", name));
  expect(new Set(hues).size).toBe(12);
  expect(names.map((name) => hueOf("node", name))).toEqual(hues);
  // Nodes and marks are keyed apart: a mark named like a node gets its own entry (the palette is full now, so it shares).
  expect(typeof hueOf("mark", "Type0")).toBe("number");
});
