import {expect, it} from "vitest"

const sources = import.meta.glob<string>("../src/**/*.ts", {query: "?raw", import: "default", eager: true})

// A named import Wordgard doesn't export fails the app's build or page load, which no `try` can
// catch. Read through a namespace, a missing value is `undefined`, and the guards handle it.
it("imports Wordgard's values through namespaces only", () => {
  const named = Object.entries(sources).flatMap(([file, text]) =>
    [...text.matchAll(/^import\s+(?!type\b|\*)[^;]*?from\s+"wordgard(\/[^"]*)?"/gm)].map(m => `${file}: ${m[0]}`),
  )
  expect(Object.keys(sources).length).toBeGreaterThan(5)
  expect(named).toEqual([])
})
