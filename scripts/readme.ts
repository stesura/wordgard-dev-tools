// The README's "Tabs" section and its entries in Contents, written from the panel's guides
// (packages/panel/src/guides/<tab>.md), so the two say the same.
//   node scripts/readme.ts           rewrite it
//   node scripts/readme.ts --check   fail if it's out of date
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseGuide } from "../packages/panel/src/guides/parse.ts";
import { TABS } from "../packages/panel/src/tabs/tabs.ts";

const readme = fileURLToPath(new URL("../README.md", import.meta.url));
const guides = new URL("../packages/panel/src/guides/", import.meta.url);
const START =
  "<!-- tabs:start: written from packages/panel/src/guides/ by `npm run readme`; edit there -->";
const END = "<!-- tabs:end -->";

const parsed = TABS.map(({ id }) => {
  const name = `${id}.md`;
  return { id, ...parseGuide(readFileSync(new URL(name, guides), "utf8"), name) };
});

const section = parsed
  .map(({ id, title, summary, notes, tips }) => {
    const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
    return [
      `### ${title}`,
      `![The ${title} tab](docs/screenshots/${id}.png)`,
      summary,
      ...(notes.length ? [list(notes)] : []),
      ...(tips.length ? ["Tips:", list(tips)] : []),
    ].join("\n\n");
  })
  .join("\n\n");

// Compared without carriage returns: a Windows checkout has them.
const text = readFileSync(readme, "utf8").replaceAll("\r\n", "\n");
const from = text.indexOf(START);
const to = text.indexOf(END);
if (from < 0 || to < from) throw new Error(`README.md has no ${START} … ${END} block`);
// GitHub's heading anchors: lowercased, punctuation dropped, spaces as hyphens.
const anchor = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replaceAll(" ", "-");
const contents = parsed.map(({ title }) => `  - [${title}](#${anchor(title)})\n`).join("");
const tabsEntry = /^- \[Tabs\]\(#tabs\)\n(?: {2}- .*\n)*/m;
if (!tabsEntry.test(text)) throw new Error("README.md's Contents has no - [Tabs](#tabs) entry");
const next = `${text.slice(0, from + START.length)}\n\n## Tabs\n\n${section}\n\n${text.slice(to)}`
  // A function, so a `$` in a title isn't a replacement pattern.
  .replace(tabsEntry, () => `- [Tabs](#tabs)\n${contents}`);

if (process.argv.includes("--check")) {
  if (next != text) {
    console.error("README.md's Tabs section or Contents is out of date: run npm run readme");
    process.exit(1);
  }
} else {
  writeFileSync(readme, next);
}
