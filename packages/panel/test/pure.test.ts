// The panel's pure helpers, without a panel: quick cases for what the tab tests reach only through the UI.
import { expect, it } from "vitest";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import { isPrefix, itemId, parentOf, pathOf } from "../src/lib/paths.ts";
import { clock } from "../src/lib/time.ts";
import { containers, flatten, keysOf, nodePathOf, search } from "../src/tabs/state/json-lines.ts";
import { flags, flushTitle, isSlow, ms } from "../src/tabs/log/log-format.ts";
import { pressedIn, tagsOf } from "../src/tabs/schema/schema-filters.ts";
import { toggled } from "../src/lib/sets.ts";
import { includes } from "../src/lib/text.ts";
import { TABS, isTab } from "../src/tabs/tabs.ts";
import { GUIDES } from "../src/guides/guides.ts";
import { parseGuide } from "../src/guides/parse.ts";

const row = (patch: Partial<LogRow>): LogRow => ({
  index: 0,
  time: 0,
  userEvent: null,
  appended: false,
  docChanged: false,
  selectionSet: false,
  effects: 0,
  annotations: [],
  dispatchMs: null,
  flushMs: null,
  flush: null,
  agentFlush: false,
  ...patch,
});

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

it("writes a time of day to the millisecond", () => {
  expect(clock(new Date(2026, 0, 1, 9, 5, 3, 7).getTime())).toBe("09:05:03.007");
});

it("flattens JSON into lines, collapsed or not", () => {
  const json = { doc: { content: [{ text: "a" }] }, n: 1 };
  expect(flatten(json, new Set()).map((line) => [line.id, line.kind, line.text])).toEqual([
    ["$", "open", "{"],
    ["$/doc", "open", "{"],
    ["$/doc/content", "open", "["],
    ["$/doc/content/0", "open", "{"],
    ["$/doc/content/0/text", "value", '"a"'],
    ["$/doc/content/0#", "close", "}"],
    ["$/doc/content#", "close", "]"],
    ["$/doc#", "close", "}"],
    ["$/n", "value", "1"],
    ["$#", "close", "}"],
  ]);
  const shut = flatten(json, new Set(["$/doc"]));
  expect(shut.find((line) => line.id == "$/doc")).toMatchObject({ text: "{ … }", collapsed: true });
  expect(shut.some((line) => line.id.startsWith("$/doc/"))).toBe(false);
  expect(containers(json)).toEqual(["$", "$/doc", "$/doc/content", "$/doc/content/0"]);
});

it("finds keys and values, and node paths in the state's JSON", () => {
  expect(search({ doc: { type: "para" }, other: "Para" }, "para")).toEqual([
    "$/doc/type",
    "$/other",
  ]);
  expect(keysOf("$/doc/content/1#")).toEqual(["doc", "content", "1"]);
  expect(keysOf("$/a%2Fb")).toEqual(["a/b"]);
  expect(nodePathOf(["doc", "content", "1", "content", "0"])).toEqual([1, 0]);
  expect(nodePathOf(["doc"])).toEqual([]);
  expect(nodePathOf(["selection"])).toBeNull();
  expect(nodePathOf(["doc", "marks", "0"])).toBeNull();
});

it("formats a log row's timings and flags", () => {
  expect(ms(null)).toBe("–");
  expect(ms(2.345)).toBe("2.3");
  expect(isSlow(row({ dispatchMs: 17 }))).toBe(true);
  expect(isSlow(row({ dispatchMs: 3, flushMs: 16 }))).toBe(false);
  expect(flags(row({ docChanged: true, annotations: ["focus"], appended: true }))).toEqual([
    "doc",
    "focus",
    "app",
  ]);
  expect(flushTitle(row({}))).toBe("Not drawn yet");
  expect(flushTitle(row({ flush: 3, agentFlush: true }))).toBe(
    "Flush #3, forced by DevTools' own read"
  );
});

it("filters schema types by name and tags", () => {
  expect(includes("Paragraph", "graph")).toBe(true);
  expect(includes("Paragraph", "x")).toBe(false);
  expect(tagsOf([{ t: ["a", "b"] }, { t: ["b", "c"] }], (type) => type.t)).toEqual(["a", "b", "c"]);
  expect([...toggled(new Set(["a"]), "a")]).toEqual([]);
  expect([...toggled(new Set(["a"]), "b")]).toEqual(["a", "b"]);
  // A saved tag this schema doesn't have isn't pressed.
  expect([...pressedIn(new Set(["a", "gone"]), ["a", "b"])]).toEqual(["a"]);
});

it("lists each tab once, each with a guide", () => {
  const ids = TABS.map((tab) => tab.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Object.keys(GUIDES).sort()).toEqual([...ids].sort());
  expect(isTab("dom")).toBe(true);
  expect(isTab("view")).toBe(false);
  for (const id of ids) expect(GUIDES[id].tips.length).toBeGreaterThan(0);
});

it("reads a guide's markdown, and refuses what the panel can't show", () => {
  const md = (...lines: string[]) => lines.join("\n");
  expect(
    parseGuide(
      md("# T", "", "Some `code`,", "wrapped.", "", "- one [link](https://x)", "- two", "  wrapped")
    )
  ).toEqual({
    title: "T",
    summary: "Some `code`, wrapped.",
    tips: ["one [link](https://x)", "two wrapped"],
  });
  expect(() => parseGuide(md("Summary", "", "- tip"), "a.md")).toThrow("a.md: it starts with");
  expect(() => parseGuide(md("# T", "", "Summary"))).toThrow("one list");
  expect(() => parseGuide(md("# T", "", "Summary", "", "- tip", "", "More"))).toThrow("one list");
  expect(() => parseGuide(md("# T", "", "A **bold** word", "", "- tip"))).toThrow("only `code`");
  expect(() => parseGuide(md("# T", "", "Summary", "", "- tip", "  - nested"))).toThrow(
    "no nested"
  );
});
