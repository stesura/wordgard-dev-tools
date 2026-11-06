import { expect, it } from "vitest";
import { parseGuide } from "../parse.ts";

const md = (...lines: string[]) => lines.join("\n");

it("reads a guide's markdown: summary, notes, tips", () => {
  expect(
    parseGuide(
      md(
        "# T",
        "",
        "Some `code`,",
        "wrapped.",
        "",
        "- one [link](https://x)",
        "- two",
        "  wrapped",
        "",
        "## Tips",
        "",
        "- click"
      )
    )
  ).toEqual({
    title: "T",
    summary: "Some `code`, wrapped.",
    notes: ["one [link](https://x)", "two wrapped"],
    tips: ["click"],
  });
});

it("takes notes or tips alone, or neither", () => {
  expect(parseGuide(md("# T", "", "S", "", "- note"))).toMatchObject({ notes: ["note"], tips: [] });
  expect(parseGuide(md("# T", "", "S", "", "## Tips", "", "- tip"))).toMatchObject({
    notes: [],
    tips: ["tip"],
  });
  expect(parseGuide(md("# T", "", "S"))).toMatchObject({ notes: [], tips: [] });
});

it("refuses what the panel can't show", () => {
  expect(() => parseGuide(md("Summary", "", "- tip"), "a.md")).toThrow("a.md: it starts with");
  expect(() => parseGuide(md("# T", "", "S", "", "- tip", "", "More"))).toThrow(
    "after the summary"
  );
  expect(() => parseGuide(md("# T", "", "S", "", "## Tips", "", "More"))).toThrow("a list follows");
  expect(() => parseGuide(md("# T", "", "S", "", "## Tips", "", "- t", "", "- u"))).toThrow(
    "after the summary"
  );
  expect(() => parseGuide(md("# T", "", "A **bold** word", "", "- tip"))).toThrow("only `code`");
  expect(() => parseGuide(md("# T", "", "Summary", "", "- tip", "  - nested"))).toThrow(
    "no nested"
  );
});
