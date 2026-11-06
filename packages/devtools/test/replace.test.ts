import {afterEach, expect, it, vi} from "vitest"
import type {Wordgard} from "wordgard/editor"
import {history, undo} from "wordgard/history"
import {wordgardDevtools} from "../src/index.ts"
import {ask, editor, registry} from "./helpers.ts"

const editors: Wordgard[] = []
afterEach(() => {
  for (const wg of editors.splice(0)) wg.dom.remove()
  vi.restoreAllMocks()
})

const open = () => {
  const wg = editor([wordgardDevtools(), history()], "<h1>Title</h1><p>Hi</p>")
  editors.push(wg)
  return {wg, id: registry().editors.get(wg)?.id ?? 0}
}

it("replaces the document and selection with a state's JSON, undoably", async () => {
  const {wg, id} = open()
  const json = await ask({type: "stateJSON", id})
  if (typeof json != "object" || json == null || !("doc" in json)) throw new Error("No doc")
  const other = editor([], "<p>Other</p><p>text</p>")
  editors.push(other)
  const next = {...other.state.toJSON(), selection: {type: "text", anchor: 3}}
  expect(await ask({type: "replaceState", id, json: next})).toEqual({exact: true})
  expect(wg.state.doc.eq(other.state.doc)).toBe(true)
  expect(wg.state.selection.head).toBe(3)
  const back = undo(wg, null)
  if (back) wg.dispatch(back)
  expect(await ask({type: "stateJSON", id})).toMatchObject({doc: json.doc})
})

it("refuses a state that breaks the schema, and logs why", async () => {
  const {wg, id} = open()
  const before = wg.state.doc
  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  // A paragraph can't hold a heading.
  const nested = {
    doc: {type: "Doc", content: [{type: "Paragraph", content: [{type: "Heading", content: [{type: "Text", param: "x"}]}]}]},
    selection: {type: "text", anchor: 1},
  }
  await expect(ask({type: "replaceState", id, json: nested})).rejects.toThrow(/Paragraph.*contain.*Heading/)
  await expect(ask({type: "replaceState", id, json: {doc: {type: "Nope"}, selection: {}}})).rejects.toThrow(
    "not a state of this editor's schema",
  )
  expect(errors.mock.calls[0]?.[0]).toContain("Couldn't replace the state")
  expect(wg.state.doc).toBe(before)
})
