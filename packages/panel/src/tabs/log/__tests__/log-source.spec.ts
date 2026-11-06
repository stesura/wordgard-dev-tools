import { expect, it } from "vitest";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import { flushesChecked } from "../log-source.ts";

const row = (
  index: number,
  flush: number | null,
  summary: LogRow["decorationSummary"]
): LogRow => ({
  index,
  time: 0,
  userEvent: null,
  appended: false,
  docChanged: false,
  selectionSet: true,
  effects: 0,
  annotations: [],
  dispatchMs: null,
  flushMs: null,
  flush,
  agentFlush: false,
  decorationSummary: summary,
});

it("counts the flushes, and those checked; rows not drawn count for none", () => {
  const done = { wasted: 0, updated: 0, recreated: 0, notMapped: 0 };
  expect(
    flushesChecked([
      row(0, 1, "pending"),
      row(1, 1, "pending"),
      row(2, 2, done),
      row(3, 3, done),
      row(4, null, null),
    ])
  ).toEqual({ checked: 2, flushes: 3 });
  expect(flushesChecked([])).toEqual({ checked: 0, flushes: 0 });
});
