// The README's "Tabs" section, written from the panel's guides (packages/panel/src/guides.ts), so
// the two say the same.
//   node scripts/readme.ts           rewrite it
//   node scripts/readme.ts --check   fail if it's out of date
import {readFileSync, writeFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {GUIDES, TAB_ORDER} from "../packages/panel/src/guides.ts"

const readme = fileURLToPath(new URL("../README.md", import.meta.url))
const START = "<!-- tabs:start: written from packages/panel/src/guides.ts by `npm run readme`; edit there -->"
const END = "<!-- tabs:end -->"

const section = TAB_ORDER.map(view => {
  const {title, summary, tips} = GUIDES[view]
  return [
    `### ${title}`,
    `![The ${title} tab](docs/screenshots/${view}.png)`,
    summary,
    tips.map(tip => `- ${tip}`).join("\n"),
  ].join("\n\n")
}).join("\n\n")

// Compared without carriage returns: a Windows checkout has them.
const text = readFileSync(readme, "utf8").replaceAll("\r\n", "\n")
const from = text.indexOf(START)
const to = text.indexOf(END)
if (from < 0 || to < from) throw new Error(`README.md has no ${START} … ${END} block`)
const next = `${text.slice(0, from + START.length)}\n\n## Tabs\n\n${section}\n\n${text.slice(to)}`

if (process.argv.includes("--check")) {
  if (next != text) {
    console.error("README.md's Tabs section is out of date: run npm run readme")
    process.exit(1)
  }
} else {
  writeFileSync(readme, next)
}
