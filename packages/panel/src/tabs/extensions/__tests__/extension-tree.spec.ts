import { expect, it } from "vitest";
import type { ExtensionNode } from "@stesura/wordgard-dev-tools";
import { ancestorsOf, folders, linesOf, nodeAt, pathOfId, search } from "../extension-tree.ts";

const node = (label: string, children: ExtensionNode[] = [], value: string | null = null) => ({
  kind: "group" as const,
  label,
  prec: "default" as const,
  value,
  duplicate: false,
  field: null,
  source: null,
  facet: null,
  children,
  more: 0,
});

const root = node("configuration", [
  node("highest", [node("field #1"), node("facet #1", [], '"x"')]),
  node("Feature", [node("facet #2")]),
  node("facet #3"),
]);

it("lists the rows shown, skipping what's collapsed", () => {
  expect(linesOf(root, new Set()).map((l) => [l.id, l.depth, l.node.label])).toEqual([
    ["0", 0, "highest"],
    ["0.0", 1, "field #1"],
    ["0.1", 1, "facet #1"],
    ["1", 0, "Feature"],
    ["1.0", 1, "facet #2"],
    ["2", 0, "facet #3"],
  ]);
  const closed = linesOf(root, new Set(["0", "2"]));
  expect(closed.map((l) => l.id)).toEqual(["0", "1", "1.0", "2"]);
  // A leaf is never collapsed.
  expect(closed.find((l) => l.id == "2")?.collapsed).toBe(false);
  expect(closed[0]?.collapsed).toBe(true);
});

it("finds folders, nodes, matches and ancestors", () => {
  expect(folders(root)).toEqual(["0", "1"]);
  expect(nodeAt(root, "1.0")?.label).toBe("facet #2");
  expect(nodeAt(root, "")?.label).toBe("configuration");
  expect(nodeAt(root, "5.1")).toBeUndefined();
  expect(search(root, "FACET")).toEqual(["0.1", "1.0", "2"]);
  expect(search(root, '"x"')).toEqual(["0.1"]);
  expect(ancestorsOf("1.0.2")).toEqual(["1", "1.0"]);
  expect(pathOfId("1.0")).toEqual([1, 0]);
  expect(pathOfId("")).toEqual([]);
});
