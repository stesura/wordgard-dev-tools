import { expect, it } from "vitest";
import { parseGuide } from "../parse.ts";

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
