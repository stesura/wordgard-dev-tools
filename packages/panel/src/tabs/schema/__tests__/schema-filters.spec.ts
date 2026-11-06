import { afterEach, expect, it } from "vitest";
import { createSchemaFilters, noFilters, pressedIn, tagsOf } from "../schema-filters.ts";

it("lists the types' tags, and the pressed ones this schema has", () => {
  expect(tagsOf([{ t: ["a", "b"] }, { t: ["b", "c"] }], (type) => type.t)).toEqual(["a", "b", "c"]);
  // A saved tag this schema doesn't have isn't pressed.
  expect([...pressedIn(new Set(["a", "gone"]), ["a", "b"])]).toEqual(["a"]);
});

const KEY = "wordgard-devtools:schema-filters";

afterEach(() => localStorage.clear());

it("reads saved filters, a section open unless saved closed", () => {
  localStorage.setItem(
    KEY,
    JSON.stringify({ query: 5, open: { node: false }, nodes: ["textblock"], marks: "x" })
  );
  const filters = createSchemaFilters().get();
  expect(filters.query).toBe("");
  expect(filters.open).toEqual({ node: false, mark: true, group: true });
  expect([...filters.nodes]).toEqual(["textblock"]);
  expect([...filters.marks]).toEqual([]);
  expect([...filters.groups]).toEqual([]);
  localStorage.setItem(KEY, "null");
  expect(createSchemaFilters().get()).toBe(noFilters);
});

it("saves the tag sets as lists", () => {
  createSchemaFilters().set({ ...noFilters, query: "Para", nodes: new Set(["leaf"]) });
  expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual({
    query: "Para",
    open: { node: true, mark: true, group: true },
    nodes: ["leaf"],
    marks: [],
    groups: [],
  });
});
