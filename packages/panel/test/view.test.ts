import {afterEach, expect, it, vi} from "vitest"
import {userEvent} from "vitest/browser"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "@stesura/wordgard-dev-tools"
import {mountDevtools, type MountedDevtools} from "../src/index.ts"

let wg: Wordgard | null = null
let mounted: MountedDevtools | null = null

afterEach(() => {
  mounted?.unmount()
  mounted = null
  wg?.dom.remove()
  wg = null
  localStorage.clear()
  vi.restoreAllMocks()
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
const line = (id: string) => shadow().querySelector<HTMLElement>(`[aria-label='View'] [data-dom='${id}']`)
const overlay = () => document.querySelector<HTMLElement>("[data-wordgard-devtools-overlay]")

const setup = async () => {
  wg = Wordgard.create({parent: document.body, doc: "<h1>Title</h1><p>Hi</p>", config: [basicSchema(), wordgardDevtools()]})
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "bottom", size: 640, collapsed: false}))
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("DOM"))).click()
  await until(() => line("0"))
  return wg
}

it("shows the view's status and its DOM, mapped to the document, live", async () => {
  const editor = await setup()
  expect(shadow().querySelector("[aria-label='View status']")?.textContent).toContain("root:document")
  expect(line("")?.textContent).toContain("<wg-content")
  expect(line("0")?.textContent).toMatch(/<h1.*>Heading 0–7/)
  expect(line("0.0")?.textContent).toBe('"Title"pos 1')
  editor.dispatch({changes: {from: 1, insert: [Leaf.text("A ")]}})
  await until(() => line("0.0")?.textContent == '"A Title"pos 1')
})

it("outlines a clicked element in the page, walks with the keys, and logs it", async () => {
  await setup()
  await userEvent.click(await until(() => line("1")))
  await until(() => overlay()?.textContent == "p")
  await userEvent.keyboard("{ArrowUp}")
  await until(() => overlay()?.textContent == "text")
  const log = vi.spyOn(console, "log").mockImplementation(() => {})
  shadow().querySelector<HTMLButtonElement>("[aria-label='Log to the console']")?.click()
  await until(() => log.mock.calls.length)
  // Gone with the tab.
  ;(await until(() => tab("State"))).click()
  await until(() => !overlay())
})

it("logs the editor to the page's console", async () => {
  const editor = await setup()
  const logged: unknown[][] = []
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  ;(await until(() => shadow().querySelector<HTMLButtonElement>("[aria-label=\"Log the editor to the page's console\"]"))).click()
  await until(() => logged.some(args => args[0] == "[wordgard-devtools] editor" && args[1] == editor))
})

it("clears the selection and its outline", async () => {
  await setup()
  const clear = await until(() => shadow().querySelector<HTMLButtonElement>("[aria-label='Clear the selection']"))
  expect(clear.disabled).toBe(true)
  await userEvent.click(await until(() => line("1")))
  await until(() => overlay()?.textContent == "p")
  clear.click()
  await until(() => !overlay())
  expect(line("1")?.getAttribute("aria-selected")).not.toBe("true")
  expect(clear.disabled).toBe(true)
})

it("searches text, tags and node names, opening and outlining the match", async () => {
  await setup()
  // In the DOM tab's panel: the Structure has a button of the same name.
  shadow()
    .querySelector("[aria-label='View']")
    ?.closest("[role='tabpanel']")
    ?.querySelector<HTMLButtonElement>("[aria-label='Collapse all']")
    ?.click()
  await until(() => !line("0.0"))
  const input = await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Search the DOM']"))
  await userEvent.click(input)
  await userEvent.keyboard("title")
  await until(() => line("0.0")?.className.includes("bg-yellow-500/40"))
  await until(() => overlay()?.textContent == "text")
  expect(input.parentElement?.textContent).toContain("1/1")
  await userEvent.clear(input)
  await userEvent.keyboard("paragraph")
  await until(() => line("1")?.className.includes("bg-yellow-500/40"))
  await until(() => overlay()?.textContent == "p")
})
