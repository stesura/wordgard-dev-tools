import { expect, it } from "vitest";
import { TABS } from "../../tabs/tabs.ts";
import { GUIDES } from "../guides.ts";
import { parseGuide } from "../parse.ts";

it("has a guide for each tab, with tips", () => {
  const ids = TABS.map((tab) => tab.id);
  expect(Object.keys(GUIDES).sort()).toEqual([...ids].sort());
  for (const id of ids) expect(GUIDES[id].tips.length).toBeGreaterThan(0);
});

// The notes are Wordgard's; using the panel goes in the tips.
it("keeps the panel's interactions out of the notes", () => {
  const files = import.meta.glob<string>("../*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const interaction = /\b(right-click|double-click|click|hover|press|type a|untick|tick)\b/i;
  for (const [file, text] of Object.entries(files)) {
    for (const note of parseGuide(text, file).notes) expect(note, file).not.toMatch(interaction);
  }
});
