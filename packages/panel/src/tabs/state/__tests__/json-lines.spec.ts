import { expect, it } from "vitest";
import { containers, flatten, keysOf, nodePathOf, search } from "../json-lines.ts";

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
