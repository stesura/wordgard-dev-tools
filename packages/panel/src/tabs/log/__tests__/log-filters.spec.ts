import { afterEach, expect, it } from "vitest";
import { createLogFilters, noFilters } from "../log-filters.tsx";

const KEY = "wordgard-devtools:log-filters";
const saved = () => JSON.parse(localStorage.getItem(KEY) ?? "null");

afterEach(() => localStorage.clear());

it("reads saved filters, leaving out what isn't one", () => {
  localStorage.setItem(
    KEY,
    JSON.stringify({ events: ["input.type", 3], hidden: ["doc", "bogus"], annotations: "remote" })
  );
  const filters = createLogFilters().get();
  expect([...filters.events]).toEqual(["input.type"]);
  expect([...filters.hidden]).toEqual(["doc"]);
  expect([...filters.annotations]).toEqual([]);
  localStorage.setItem(KEY, "[]");
  expect(createLogFilters().get()).toBe(noFilters);
});

it("saves the filters, but not unnamed annotations: their numbers change on reload", () => {
  const filters = createLogFilters();
  filters.set({
    events: new Set(["select.pointer"]),
    hidden: new Set(["focus"]),
    annotations: new Set(["annotation #1", "remote"]),
  });
  expect(saved()).toEqual({
    events: ["select.pointer"],
    hidden: ["focus"],
    annotations: ["remote"],
  });
});
