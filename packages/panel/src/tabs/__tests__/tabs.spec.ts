import { expect, it } from "vitest";
import { TABS, isTab } from "../tabs.ts";

it("lists each tab once", () => {
  const ids = TABS.map((tab) => tab.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(isTab("dom")).toBe(true);
  expect(isTab("view")).toBe(false);
});
