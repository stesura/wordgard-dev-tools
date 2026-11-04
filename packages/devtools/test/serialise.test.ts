import {expect, it} from "vitest"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {GardState} from "wordgard/state"
import {wordgardDevtools} from "../src/index.ts"
import {preview, toSafe} from "../src/serialise.ts"
import {ask, registry} from "./helpers.ts"

it("copies values safely", () => {
  const cyclic: Record<string, unknown> = {a: 1}
  cyclic.self = cyclic
  expect(toSafe(cyclic)).toEqual({a: 1, self: "[Circular]"})
  expect(toSafe({deep: {deeper: {}}}, 1)).toEqual({deep: "[Object]"})
  expect(toSafe(new Map([["k", 1]]))).toEqual({"[Map]": [["k", 1]]})
  expect(toSafe(new Set([1, 2]))).toEqual({"[Set]": [1, 2]})
  expect(toSafe(new RangeError("bad"))).toEqual({name: "RangeError", message: "bad"})
  expect(toSafe(new Uint8Array(3))).toBe("[Uint8Array(3 bytes)]")
  expect(toSafe(document.body)).toBe("[BODY]")
  expect(toSafe(() => 1)).toBe("[Function anonymous]")
  expect(toSafe(10n)).toBe("10n")
  expect(toSafe({toJSON: () => ({json: true})})).toEqual({json: true})
  // Shared, not cyclic: kept twice.
  const shared = {x: 1}
  expect(toSafe([shared, shared])).toEqual([{x: 1}, {x: 1}])
})

it("previews values as truncated JSON", () => {
  expect(preview(null)).toBeNull()
  expect(preview("hi")).toBe('"hi"')
  expect(preview({src: "a".repeat(100)})).toHaveLength(80)
})

it("walks an object whose toJSON needs arguments", () => {
  const value = {
    depth: 2,
    toJSON: (state: {facet: () => number}) => state.facet(),
  }
  expect(toSafe(value)).toEqual({depth: 2, toJSON: "[Function toJSON]"})
})

it("serialises the state, with the named fields that can", async () => {
  const count = GardState.Field.define<number>({create: () => 3, update: v => v, toJSON: v => ({count: v})})
  const plain = GardState.Field.define<number>({create: () => 4, update: v => v})
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), count, plain, wordgardDevtools({fields: {count, plain}})],
  })
  const json = await ask({type: "stateJSON", id: registry().editors.get(wg)?.id ?? 0})
  expect(json).toEqual({
    doc: {type: "Doc", content: [{type: "Paragraph", content: [{type: "Text", param: "Hi"}]}]},
    selection: expect.objectContaining({type: "text", anchor: 1}),
    count: {count: 3},
  })
  wg.dom.remove()
})
