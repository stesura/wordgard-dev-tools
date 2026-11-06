import { expect, it } from "vitest";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import { flags, flushTitle, isSlow, ms } from "../log-format.ts";

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
