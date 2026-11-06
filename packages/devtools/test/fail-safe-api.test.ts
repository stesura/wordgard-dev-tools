import {expect, it, vi} from "vitest"
import {Wordgard} from "wordgard/editor"
import {wordgardDevtools} from "../src/index.ts"
import {editor} from "./helpers.ts"

// A Wordgard whose API the devtools don't know: building their extension throws.
it("adds nothing, with one warning, when Wordgard's API doesn't match", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const of = vi.spyOn(Wordgard.updateListener, "of").mockImplementation(() => {
    throw new TypeError("Wordgard.updateListener.of is not a function")
  })

  expect(wordgardDevtools()).toEqual([])
  of.mockRestore()
  expect(wordgardDevtools()).toEqual([])
  expect(warn).toHaveBeenCalledOnce()

  const wg = editor(wordgardDevtools())
  expect(window.__WORDGARD_DEVTOOLS__?.editors.has(wg) ?? false).toBe(false)
  wg.dom.remove()
  warn.mockRestore()
})
