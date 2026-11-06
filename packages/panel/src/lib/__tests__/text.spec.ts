import { expect, it } from "vitest";
import { includes } from "../text.ts";

it("finds text, ignoring case", () => {
  expect(includes("Paragraph", "graph")).toBe(true);
  expect(includes("Paragraph", "GRAPH")).toBe(true);
  expect(includes("Paragraph", "x")).toBe(false);
});
