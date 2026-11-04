// Two copies of the package on one page, as when the app and react-wordgard
// bundle their own. Its own file: each test file gets a fresh window.
import {expect, it} from "vitest"
import {Leaf} from "wordgard/doc"
import * as first from "../src/index.ts"
import type * as Devtools from "../src/index.ts"
import {editor, nextMessage, post, pushes, registry} from "./helpers.ts"

const secondCopy = "../src/index.ts?copy=b"
const loadSecond = async (): Promise<typeof Devtools> => import(/* @vite-ignore */ secondCopy)

it("shares one registry, and only its creator runs the agent", async () => {
  const second = await loadSecond()
  expect(second.wordgardDevtools).not.toBe(first.wordgardDevtools)
  expect(window.__WORDGARD_DEVTOOLS__).toBeUndefined()

  // The second copy connects first, so it creates the registry and its agent, which announces itself.
  const announced = nextMessage("announce")
  const a = editor(second.wordgardDevtools({name: "from second"}))
  expect(await announced).toMatchObject({kind: "announce"})
  const created = registry().agent
  const b = editor(first.wordgardDevtools({name: "from first"}))
  expect(registry().agent).toBe(created)
  expect([...registry().editors.values()].map(e => e.name)).toEqual(["from second", "from first"])

  // One agent answers.
  const replies = await post({type: "listEditors"})
  expect(replies).toHaveLength(1)

  // One editor with both copies' plugins: one entry, one push per update.
  const both = editor([first.wordgardDevtools(), second.wordgardDevtools({name: "both"})])
  expect(registry().editors.size).toBe(3)
  const entry = registry().editors.get(both)
  await first.ensureRegistry()?.agent?.request({type: "select", id: entry?.id ?? 0})
  const {seen, stop} = pushes()
  both.dispatch({changes: {from: 1, insert: [Leaf.text("x")]}})
  both.flush()
  stop()
  expect(seen).toEqual([{type: "stateChanged", id: entry?.id, docChanged: true, selectionSet: false, reconfigured: false}])

  // Both copies' transaction listeners deliver each transaction: logged once.
  const id = entry?.id ?? 0
  await first.ensureRegistry()?.agent?.request({type: "record", id, on: true})
  both.dispatch({changes: {from: 1, insert: [Leaf.text("y")]}})
  const log = await first.ensureRegistry()?.agent?.request({type: "log", id, from: 0, to: 10})
  expect(log?.ok && log.value.rows.length).toBe(1)

  for (const wg of [a, b, both]) wg.dom.remove()
  expect(registry().editors.size).toBe(0)
})
