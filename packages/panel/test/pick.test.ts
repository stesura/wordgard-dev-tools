import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

const editors: Wordgard[] = []
let mounted: MountedDevtools | null = null

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

const row = (path: string) => shadow().querySelector<HTMLElement>(`[data-path='${path}']`)
const overlay = () => document.querySelector<HTMLElement>("[data-wordgard-devtools-overlay]")
const pickButton = () => shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']")

const open = (name: string, doc: string) => {
  const wg = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name})]})
  editors.push(wg)
  return wg
}

const setup = async () => {
  const first = open("first", "<p>Alpha</p>")
  const second = open("second", "<h1>Title</h1><p>Hello <strong>world</strong></p>")
  mounted = mountDevtools()
  await mounted.ready
  await until(() => row("0")?.textContent?.includes("Alpha"))
  return {first, second}
}

it("outlines a clicked row's node in the page, not a hovered one", async () => {
  const {first} = await setup()
  await userEvent.hover(await until(() => row("0")))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(overlay()).toBeNull()
  ;(await until(() => row("0"))).click()
  await until(() => overlay()?.textContent == "Paragraph")
  const paragraph = first.nodeDOM(0)
  expect(overlay()?.firstElementChild?.getBoundingClientRect().top).toBe(paragraph?.getBoundingClientRect().top)
  // It stays while the pointer leaves, and goes with the tab.
  await userEvent.hover(first.contentDOM)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(overlay()).not.toBeNull()
  shadow().querySelectorAll<HTMLElement>("[role='tab']")[1]?.click()
  await until(() => !overlay())
})

it("picks a node in another editor and reveals it", async () => {
  const {second} = await setup()
  const button = await until(() => pickButton())
  button.click()
  await until(() => pickButton()?.getAttribute("aria-pressed") == "true")
  const before = second.state.selection
  const strong = second.contentDOM.querySelector("strong")
  if (!strong) throw new Error("No strong element")
  await userEvent.click(strong)
  await until(() => row("1.1")?.getAttribute("aria-selected") == "true")
  expect(shadow().querySelector("[aria-label='Editor']")?.textContent).toContain("second")
  expect(pickButton()?.getAttribute("aria-pressed")).toBe("false")
  expect(second.state.selection).toBe(before)
  const pane = await until(() => shadow().querySelector("[aria-label='Node']"))
  await until(() => pane.textContent?.includes('text"world"'))
})

it("leaves pick mode on Escape in the page", async () => {
  await setup()
  ;(await until(() => pickButton())).click()
  await until(() => pickButton()?.getAttribute("aria-pressed") == "true")
  await userEvent.keyboard("{Escape}")
  await until(() => pickButton()?.getAttribute("aria-pressed") == "false")
})
