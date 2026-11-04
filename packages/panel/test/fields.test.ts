import {afterEach, expect, it} from "vitest"
import {Wordgard} from "wordgard/editor"
import {history} from "wordgard/history"
import {basicSchema} from "wordgard/schema"
import {GardState, Transaction} from "wordgard/state"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

let wg: Wordgard | null = null
let mounted: MountedDevtools | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  wg?.dom.remove()
  wg = null
  localStorage.clear()
})

const until = async <T>(get: () => T | null | undefined | false, timeout = 2000): Promise<T> => {
  const start = performance.now()
  for (;;) {
    const value = get()
    if (value) return value
    if (performance.now() - start > timeout) throw new Error("Timed out")
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

const shadow = () => {
  const root = mounted?.host.shadowRoot
  if (!root) throw new Error("No shadow root")
  return root
}

const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(element => element.textContent == name)
const button = (text: string) =>
  [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() == text)
const row = (name: string) => shadow().querySelector<HTMLElement>(`[aria-label='State fields'] [data-field='${name}']`)
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Field']")

const bump = Transaction.Effect.define<number>()
const counter = GardState.Field.define<number>({
  create: () => 0,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(bump) ? v + e.value : v), value),
})

const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), history(), counter, wordgardDevtools({name: "f", fields: {counter}})],
  })
  wg = editor
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "bottom", size: 640, collapsed: false}))
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("Fields"))).click()
  await until(() => row("counter"))
  return editor
}

it("lists the fields and tracks their changes while shown", async () => {
  const editor = await setup()
  expect(row("counter")?.textContent).toContain("0")
  expect(row("field #1")).not.toBeNull()
  await until(() => shadow().textContent?.includes("Tracking changes"))
  editor.dispatch({effects: bump.of(4)})
  await until(() => row("counter")?.textContent?.startsWith("counter41"))
  row("counter")?.click()
  await until(() => pane()?.querySelector("[aria-label='History']")?.textContent?.includes("4"))
  expect(pane()?.textContent).toContain("Value4")
})

it("links a change to its transaction in the log", async () => {
  const editor = await setup()
  ;(await until(() => tab("Log"))).click()
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  ;(await until(() => tab("Fields"))).click()
  editor.dispatch({effects: bump.of(1)})
  const link = await until(() => row("counter")?.querySelector<HTMLButtonElement>("button"))
  expect(link.textContent).toBe("#0")
  link.click()
  await until(() => tab("Log")?.getAttribute("aria-selected") == "true")
  await until(() => shadow().querySelector("[role='option'][aria-selected='true'][data-index='0']"))
})

it("stops tracking when another tab is shown", async () => {
  await setup()
  await until(() => shadow().textContent?.includes("Tracking changes"))
  ;(await until(() => tab("Tree"))).click()
  await new Promise(resolve => setTimeout(resolve, 50))
  const id = [...(window.__WORDGARD_DEVTOOLS__?.editors.values() ?? [])][0]?.id ?? 0
  const reply = await window.__WORDGARD_DEVTOOLS__?.agent?.request({type: "fields", id})
  expect(reply?.ok && reply.value.tracking).toBe(false)
})

it("tracks again when the editor reconnects under the same id", async () => {
  const editor = await setup()
  await until(() => shadow().textContent?.includes("Tracking changes"))
  editor.dom.remove()
  document.body.append(editor.dom)
  await new Promise(resolve => setTimeout(resolve, 100))
  editor.dispatch({effects: bump.of(2)})
  await until(() => row("counter")?.textContent?.startsWith("counter21"))
})
