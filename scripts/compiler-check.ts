// Fails unless every build of the panel went through the React Compiler (scripts/react-compiler.ts):
// its package's dist, the extension and the demo. Run after `npm run build`.
// Compiled components check their memo cache against `Symbol.for("react.memo_cache_sentinel")`;
// React itself only declares the symbol.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const builds = [
  "packages/panel/dist",
  "packages/extension/.output/chrome-mv3",
  "packages/extension/.output/firefox-mv3",
  "demo/dist",
];
// The panel alone has about a hundred; an uncompiled build has none.
const minimum = 20;
// Minified builds quote it with backticks.
const compiled = /\]\s*===\s*Symbol\.for\(["'`]react\.memo_cache_sentinel["'`]\)/g;

const scripts = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return scripts(path);
    return entry.name.endsWith(".js") ? [path] : [];
  });

let failed = false;
for (const build of builds) {
  let count = 0;
  try {
    for (const file of scripts(`${root}${build}`))
      count += readFileSync(file, "utf8").match(compiled)?.length ?? 0;
  } catch {
    console.error(`${build}: not built`);
    failed = true;
    continue;
  }
  const ok = count >= minimum;
  if (!ok) failed = true;
  console[ok ? "log" : "error"](
    `${build}: ${count} compiled memo checks${ok ? "" : `, expected at least ${minimum}`}`
  );
}
if (failed) process.exit(1);
