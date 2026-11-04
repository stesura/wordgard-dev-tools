import {afterEach, expect, it} from "vitest"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

const editors: Wordgard[] = []
let mounted: MountedDevtools | null = null

const open = (name: string, doc: string) => {
  const wg = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name})]})
  editors.push(wg)
  return wg
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
  for (const wg of editors.splice(0)) wg.dom.remove()
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

const text = () => shadow().textContent ?? ""

const entryOf = (wg: Wordgard) => window.__WORDGARD_DEVTOOLS__?.editors.get(wg)

it("mounts in a shadow root and attaches the first editor", async () => {
  const a = open("first", "<p>Alpha</p>")
  open("second", "<p>Beta</p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => text().includes("Alpha"))
  expect(text()).toContain("2 editors")
  expect(entryOf(a)?.attached).toBe(true)
  // Styles are adopted by the shadow root, not added to the page.
  expect(shadow().adoptedStyleSheets.length).toBe(1)
  expect(document.head.querySelector("style[data-vite-dev-id*='styles.css']")).toBeNull()
})

it("follows the attached editor's updates and switches editors", async () => {
  const a = open("first", "<p>Alpha</p>")
  const b = open("second", "<p>Beta</p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => text().includes("Alpha"))

  a.dispatch({changes: {from: 1, insert: [Leaf.text("Live ")]}})
  await until(() => text().includes("Live Alpha"))

  const trigger = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Editor']"))
  trigger.click()
  const option = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find(o => o.textContent?.includes("second")),
  )
  option.click()
  await until(() => text().includes("Beta"))
  expect(entryOf(a)?.attached).toBe(false)
  expect(entryOf(b)?.attached).toBe(true)
})

it("lists editors that connect after it mounted", async () => {
  mounted = mountDevtools()
  await mounted.ready
  await until(() => text().includes("No editors"))
  open("late", "<p>Late</p>")
  await until(() => text().includes("Late"))
})

it("collapses to a button and detaches", async () => {
  const a = open("first", "<p>Alpha</p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => entryOf(a)?.attached)
  const collapse = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Collapse']"))
  collapse.click()
  const expand = await until(() =>
    [...shadow().querySelectorAll("button")].find(button => button.textContent == "Wordgard DevTools"),
  )
  await until(() => entryOf(a)?.attached === false)
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:dock") ?? "{}")).toMatchObject({collapsed: true})
  expand.click()
  await until(() => entryOf(a)?.attached)
})

it("detaches on unmount", async () => {
  const a = open("first", "<p>Alpha</p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => entryOf(a)?.attached)
  mounted.unmount()
  mounted = null
  await until(() => entryOf(a)?.attached === false)
  expect(document.querySelector("wordgard-devtools")).toBeNull()
})

it("follows the picked editor through a remount", async () => {
  open("first", "<p>Alpha</p>")
  const b = open("second", "<p>Beta</p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => text().includes("Alpha"))
  const trigger = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Editor']"))
  trigger.click()
  const option = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find(o => o.textContent?.includes("second")),
  )
  option.click()
  await until(() => text().includes("Beta"))
  b.dom.remove()
  await until(() => text().includes("Alpha"))
  const again = open("second", "<p>Beta again</p>")
  await until(() => text().includes("Beta again"))
  expect(entryOf(again)?.attached).toBe(true)
})
