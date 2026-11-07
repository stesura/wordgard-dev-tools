import type { DecorationInfo } from "@stesura/wordgard-dev-tools";
import { expect, it } from "vitest";
import { documentOrder, indexDecorations } from "../decorations-source.ts";

it("orders paths as the document: a node before its content, siblings by index", () => {
  const paths = [[1, 0], [0], [], [1], [0, 2], [0, 10], [0, 2, 1]];
  expect(paths.toSorted(documentOrder)).toEqual([[], [0], [0, 2], [0, 2, 1], [0, 10], [1], [1, 0]]);
});

const decoration = (patch: Partial<DecorationInfo>): DecorationInfo => ({
  source: 0,
  index: 0,
  kind: "range wrapper",
  from: 0,
  to: 1,
  side: null,
  details: [],
  at: null,
  paths: [],
  parts: [],
  offset: null,
  note: null,
  ...patch,
});

it("indexes the parts of texts, and the decorated nodes once each, in document order", () => {
  const index = indexDecorations({
    sources: [],
    decorations: [
      decoration({ paths: [[2, 0]], parts: [{ path: [2, 0], from: 1, to: 3 }] }),
      decoration({ kind: "widget", at: [1], offset: null }),
      decoration({ paths: [[0], [2, 0]] }),
      // Applies to nothing: listed on the node holding it.
      decoration({ kind: "attributes", at: [3], note: "applies to no node" }),
    ],
  });
  expect(index.nodes).toEqual([[0], [1], [2, 0], [3]]);
  expect(index.parts.get("2.0")).toEqual([{ from: 1, to: 3 }]);
});
