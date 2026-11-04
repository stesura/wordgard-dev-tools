import {afterEach, expect, it} from "vitest"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {Transaction} from "wordgard/state"
import {wordgardDevtools, type Push} from "../src/index.ts"
import {agent, ask, editor, post, registry} from "./helpers.ts"

const editors: Wordgard[] = []

const open = (config: Parameters<typeof editor>[0] = []) => {
  const wg = editor([wordgardDevtools(), config])
  editors.push(wg)
  return wg
}

afterEach(async () => {
  await ask({type: "select", id: null})
  for (const wg of editors.splice(0)) wg.dom.remove()
})

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0

/** Selected and recording. */
const recording = async (wg: Wordgard, size?: number) => {
  await ask({type: "select", id: idOf(wg)})
  await ask({type: "record", id: idOf(wg), on: true, size})
}

const log = (wg: Wordgard) => ask({type: "log", id: idOf(wg), from: 0, to: Number.MAX_SAFE_INTEGER})

const type = (wg: Wordgard, text: string, pos = 1) =>
  wg.dispatch({changes: {from: pos, insert: [Leaf.text(text)]}, userEvent: "input.type"})

const effect = Transaction.Effect.define<{note: string}>()
const note = Transaction.Annotation.define<string>()

it("records transactions only while recording, with their rows", async () => {
  const wg = open()
  type(wg, "a")
  expect((await log(wg)).rows).toEqual([])
  await recording(wg)
  type(wg, "b")
  wg.dispatch({selection: {anchor: 2}, effects: effect.of({note: "x"}), annotations: note.of("n")})
  const {rows, start, end, recording: on} = await log(wg)
  expect({start, end, on}).toEqual({start: 0, end: 2, on: true})
  expect(rows[0]).toMatchObject({
    index: 0,
    userEvent: "input.type",
    appended: false,
    docChanged: true,
    selectionSet: false,
    effects: 0,
    annotations: 1,
  })
  expect(rows[1]).toMatchObject({index: 1, userEvent: null, docChanged: false, selectionSet: true, effects: 1, annotations: 1})
  expect(rows[0]?.time).toBeGreaterThan(0)

  await ask({type: "record", id: idOf(wg), on: false})
  type(wg, "c")
  expect((await log(wg)).end).toBe(2)
})

it("logs appended transactions as their own entries", async () => {
  const appender = Transaction.appender.of(trs =>
    trs.some(tr => tr.isUserEvent("input")) ? {changes: {from: 1, insert: [Leaf.text("!")]}} : null,
  )
  const wg = open(appender)
  await recording(wg)
  type(wg, "a")
  const {rows} = await log(wg)
  expect(rows.map(r => [r.userEvent, r.appended])).toEqual([
    ["input.type", false],
    [null, true],
  ])
})

it("keeps the last entries in a ring buffer, with indices that keep counting", async () => {
  const wg = open()
  await recording(wg, 3)
  for (const text of "abcde") type(wg, text)
  const all = await log(wg)
  expect(all).toMatchObject({start: 2, end: 5, size: 3})
  expect(all.rows.map(r => r.index)).toEqual([2, 3, 4])
  expect((await ask({type: "log", id: idOf(wg), from: 3, to: 4})).rows.map(r => r.index)).toEqual([3])
  await expect(ask({type: "entry", id: idOf(wg), index: 0})).rejects.toThrow("no longer in the log")

  await ask({type: "clear", id: idOf(wg)})
  expect(await log(wg)).toMatchObject({start: 5, end: 5, rows: []})
  type(wg, "f")
  expect((await log(wg)).rows.map(r => r.index)).toEqual([5])
})

it("serialises an entry on request: changes, ranges, selection, effects, annotations", async () => {
  const wg = open()
  await recording(wg)
  // "Title": 1–6. Replaces "tl" (3–5) with "XY", selects and adds an effect.
  wg.dispatch({
    changes: {from: 3, to: 5, insert: [Leaf.text("XY")]},
    selection: {anchor: 4},
    effects: effect.of({note: "x"}),
    annotations: note.of("n"),
    userEvent: "input",
  })
  const entry = await ask({type: "entry", id: idOf(wg), index: 0})
  expect(entry.changes).toEqual(expect.any(Array))
  expect(entry.ranges).toHaveLength(1)
  expect(entry.ranges[0]).toMatchObject({fromA: 3, toA: 5, fromB: 3, toB: 5, beforeText: "tl", afterText: "XY"})
  expect(entry.selection.set).toEqual({type: "text", anchor: 4})
  expect(entry.selection.after).toEqual({type: "text", anchor: 4})
  expect(entry.effectValues).toEqual([{type: "effect", value: {note: "x"}}])
  expect(entry.annotationValues.map(a => a.type)).toEqual(["annotation", "userEvent", "time"])
  expect(entry.annotationValues[0]?.value).toBe("n")
  expect(entry.reconfigured).toBe(false)
})

it("dedupes transactions delivered by two package copies", async () => {
  // Two listeners delivering the same transactions, as two copies' plugins do.
  const twice = Wordgard.transactionListener.of((trs, view) => {
    const entry = registry().editors.get(view)
    if (entry) agent().recorded(entry, trs)
  })
  const wg = open(twice)
  await recording(wg)
  type(wg, "a")
  expect((await log(wg)).rows).toHaveLength(1)
})

it("times dispatch and flush with own-property wrappers, restored on pause", async () => {
  const wg = open()
  const dispatch = wg.dispatch
  expect(Object.hasOwn(wg, "flush")).toBe(false)
  await recording(wg)
  expect(Object.hasOwn(wg, "flush")).toBe(true)
  expect(wg.dispatch).not.toBe(dispatch)

  type(wg, "a")
  type(wg, "b")
  let rows = (await log(wg)).rows
  expect(rows.every(r => r.dispatchMs != null && r.flushMs == null)).toBe(true)
  expect((await log(wg)).pending).toBe(0)
  wg.flush()
  const slice = await log(wg)
  rows = slice.rows
  expect(slice.pending).toBe(2)
  expect(rows.map(r => r.flush)).toEqual([1, 1])
  expect(rows.every(r => r.flushMs != null && !r.agentFlush)).toBe(true)

  await ask({type: "record", id: idOf(wg), on: false})
  expect(Object.hasOwn(wg, "flush")).toBe(false)
  expect(wg.dispatch).toBe(dispatch)
})

it("times the last flush after a pause, then restores flush", async () => {
  const wg = open()
  await recording(wg)
  type(wg, "a")
  await ask({type: "record", id: idOf(wg), on: false})
  expect(Object.hasOwn(wg, "flush")).toBe(true)
  expect((await log(wg)).pending).toBe(0)
  wg.flush()
  expect(Object.hasOwn(wg, "flush")).toBe(false)
  expect((await log(wg)).rows[0]).toMatchObject({flush: 1})
  // Recording again wraps again.
  await ask({type: "record", id: idOf(wg), on: true})
  expect(Object.hasOwn(wg, "flush")).toBe(true)
})

it("logs a transaction dispatched to two editors sharing a state in both", async () => {
  const a = open()
  // A mirror: same state object, so the same Transaction can be dispatched to both.
  const b = Wordgard.create({parent: document.body, state: a.state})
  editors.push(b)
  await recording(a)
  // The extension's client shows b.
  await post({type: "select", id: idOf(b)})
  await post({type: "record", id: idOf(b), on: true})
  const tr = a.state.update({changes: {from: 1, insert: [Leaf.text("x")]}})
  a.dispatch(tr)
  b.dispatch(tr)
  expect((await log(a)).rows).toHaveLength(1)
  expect((await log(b)).rows).toHaveLength(1)
  await post({type: "select", id: null})
})

it("flags a slow update", async () => {
  const slow = Wordgard.updateListener.of(() => {
    const until = performance.now() + 20
    while (performance.now() < until);
  })
  const wg = open(slow)
  await recording(wg)
  type(wg, "a")
  wg.flush()
  const [row] = (await log(wg)).rows
  expect(row?.flushMs).toBeGreaterThan(16)
})

it("tags flushes forced by the agent's own reads", async () => {
  const wg = open()
  await recording(wg)
  type(wg, "a")
  // The outline reads the node's DOM: Wordgard flushes first.
  await ask({type: "highlight", id: idOf(wg), path: [0]})
  await ask({type: "highlight", id: 0, path: null})
  const [row] = (await log(wg)).rows
  expect(row).toMatchObject({flush: 1, agentFlush: true})
})

it("pushes one logChanged per task, only for attached editors", async () => {
  const wg = open()
  await recording(wg)
  const seen: Push[] = []
  const stop = agent().onPush(push => push.type == "logChanged" && seen.push(push))
  type(wg, "a")
  type(wg, "b")
  await Promise.resolve()
  expect(seen).toEqual([{type: "logChanged", id: idOf(wg), end: 2}])
  wg.flush()
  await Promise.resolve()
  expect(seen).toHaveLength(2)
  stop()
})

it("pauses when no panel shows the editor, and drops the log when it disconnects", async () => {
  const wg = open()
  await recording(wg)
  type(wg, "a")
  await ask({type: "select", id: null})
  expect(registry().editors.get(wg)?.recording).toBe(false)
  // Its flush is still timed, then the method is restored.
  wg.flush()
  expect(Object.hasOwn(wg, "flush")).toBe(false)
  expect((await log(wg)).rows).toHaveLength(1)

  await recording(wg)
  const parent = wg.dom.parentElement
  wg.dom.remove()
  parent?.append(wg.dom)
  expect(Object.hasOwn(wg, "flush")).toBe(false)
  expect(await log(wg)).toMatchObject({rows: [], end: 0, recording: false})
})
