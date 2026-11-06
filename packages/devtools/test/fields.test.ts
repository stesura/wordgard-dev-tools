import {afterEach, expect, it, vi} from "vitest"
import {Leaf} from "wordgard/doc"
import type {Wordgard} from "wordgard/editor"
import {history} from "wordgard/history"
import {GardState, Transaction} from "wordgard/state"
import {wordgardDevtools} from "../src/index.ts"
import {ask, editor, post, registry} from "./helpers.ts"

const editors: Wordgard[] = []
afterEach(async () => {
  await ask({type: "select", id: null})
  for (const wg of editors.splice(0)) wg.dom.remove()
  vi.restoreAllMocks()
})

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0

const bump = Transaction.Effect.define<number>()
const counter = GardState.Field.define<number>({
  create: () => 0,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(bump) ? v + e.value : v), value),
})
const hidden = GardState.Field.define<string>({create: () => "in a compartment", update: v => v})
const compartment = GardState.Compartment.define()

const open = () => {
  const wg = editor([
    wordgardDevtools({fields: {counter}}),
    history(),
    counter,
    GardState.prec.high(compartment.of(hidden)),
  ])
  editors.push(wg)
  return wg
}

it("lists the state's fields, named or numbered, with their values", async () => {
  const wg = open()
  const {fields, tracking} = await ask({type: "fields", id: idOf(wg)})
  expect(tracking).toBe(false)
  const counterInfo = fields.find(f => f.name == "counter")
  expect(counterInfo).toMatchObject({named: true, preview: "0", changes: 0, last: null})
  // history()'s own field, and the one in a compartment.
  expect(fields.filter(f => !f.named).map(f => f.name)).toEqual(
    fields.filter(f => !f.named).map(f => `field #${f.index + 1}`),
  )
  expect(fields.some(f => f.preview == '"in a compartment"')).toBe(true)
  expect(fields.length).toBeGreaterThanOrEqual(3)
})

it("tracks changes while watched, linked to the log when recording", async () => {
  const wg = open()
  const id = idOf(wg)
  await expect(ask({type: "watchFields", id, on: true})).rejects.toThrow("Select the editor")
  await ask({type: "select", id})
  await ask({type: "watchFields", id, on: true})
  wg.dispatch({effects: bump.of(2)})
  wg.flush()
  let info = (await ask({type: "fields", id})).fields.find(f => f.name == "counter")
  expect(info).toMatchObject({preview: "2", changes: 1, last: {log: null, preview: "2"}})

  await ask({type: "record", id, on: true})
  wg.dispatch({effects: bump.of(3)})
  wg.flush()
  const detail = await ask({type: "field", id, index: info?.index ?? 0})
  expect(detail.value).toBe(5)
  expect(detail.history.map(c => [c.log, c.preview])).toEqual([
    [null, "2"],
    [0, "5"],
  ])
  // A document change touches history()'s field, not the counter.
  wg.dispatch({changes: {from: 1, insert: [Leaf.text("x")]}})
  wg.flush()
  info = (await ask({type: "fields", id})).fields.find(f => f.name == "counter")
  expect(info?.changes).toBe(2)
  expect((await ask({type: "fields", id})).fields.some(f => !f.named && f.changes > 0)).toBe(true)
})

it("stops tracking when no panel shows the editor", async () => {
  const wg = open()
  const id = idOf(wg)
  await ask({type: "select", id})
  await ask({type: "watchFields", id, on: true})
  await ask({type: "select", id: null})
  expect((await ask({type: "fields", id})).tracking).toBe(false)
})

it("keeps tracking for one panel when another stops watching", async () => {
  const wg = open()
  const id = idOf(wg)
  await ask({type: "select", id})
  await ask({type: "watchFields", id, on: true})
  // The extension's client shows the same editor, then hides its Fields tab.
  await post({type: "select", id})
  await post({type: "watchFields", id, on: true})
  await post({type: "watchFields", id, on: false})
  expect((await ask({type: "fields", id})).tracking).toBe(true)
  await post({type: "select", id: null})
  expect((await ask({type: "fields", id})).tracking).toBe(true)
})

it("sends and logs the value a change in the history set", async () => {
  const wg = open()
  const id = idOf(wg)
  await ask({type: "select", id})
  await ask({type: "watchFields", id, on: true})
  wg.dispatch({effects: bump.of(2)})
  wg.dispatch({effects: bump.of(3)})
  wg.flush()
  const index = (await ask({type: "fields", id})).fields.find(f => f.name == "counter")?.index ?? 0
  const [first, second] = (await ask({type: "field", id, index})).history
  expect(first && second && second.seq > first.seq).toBe(true)
  expect(await ask({type: "fieldChange", id, index, seq: first?.seq ?? 0})).toBe(2)
  const logged: unknown[][] = []
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  await ask({type: "logField", id, index, seq: second?.seq ?? 0})
  expect(logged).toEqual([["[wordgard-devtools] counter, as set by a transaction", 5]])
  logged.length = 0
  await ask({type: "logField", id, index, history: true})
  expect(logged).toEqual([
    [
      "[wordgard-devtools] counter, history (newest first)",
      [expect.objectContaining({transaction: null, value: 5}), expect.objectContaining({transaction: null, value: 2})],
    ],
  ])
  await ask({type: "clearFieldHistory", id, index})
  await expect(ask({type: "fieldChange", id, index, seq: first?.seq ?? 0})).rejects.toThrow("no longer in the history")
})

it("clears every field's history without an index", async () => {
  const wg = open()
  const id = idOf(wg)
  await ask({type: "select", id})
  await ask({type: "watchFields", id, on: true})
  wg.dispatch({effects: bump.of(2)})
  wg.dispatch({changes: {from: 1, insert: [Leaf.text("x")]}})
  wg.flush()
  expect((await ask({type: "fields", id})).fields.filter(f => f.changes > 0).length).toBeGreaterThanOrEqual(2)
  await ask({type: "clearFieldHistory", id})
  expect((await ask({type: "fields", id})).fields.every(f => f.changes == 0)).toBe(true)
})
