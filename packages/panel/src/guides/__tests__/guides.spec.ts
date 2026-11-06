import { expect, it } from "vitest";
import { TABS } from "../../tabs/tabs.ts";
import { GUIDES } from "../guides.ts";

it("has a guide for each tab, with tips", () => {
  const ids = TABS.map((tab) => tab.id);
  expect(Object.keys(GUIDES).sort()).toEqual([...ids].sort());
  for (const id of ids) expect(GUIDES[id].tips.length).toBeGreaterThan(0);
});
