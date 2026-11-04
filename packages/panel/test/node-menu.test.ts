import {afterEach, it, vi} from "vitest"
import {userEvent} from "vitest/browser"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {inPageTransport, mountDevtools, type MountedDevtools, type Transport} from "../src/index.ts"

const doc = "<h1>Title</h1><p>Alpha <strong>bold</strong></p><p>Beta</p>"

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
const treeRow = (path: string) =>
  shadow().querySelector<HTMLElement>(`[role='tree'][aria-label='Document'] [data-path='${path}']`)
const box = (path: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='Document structure'] [data-path='${path}']`)
const item = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(element => element.textContent?.trim() == text)

const rightClick = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  element.dispatchEvent(
    new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4, button: 2}),
  )
}

const setup = async (transport?: Transport) => {
  wg = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name: "m"})]})
  mounted = mountDevtools({transport})
  await mounted.ready
  return until(() => treeRow("1"))
}

it("opens on a tree row and shows its node in the Structure", async () => {
  rightClick(await setup())
  ;(await until(() => item("Show in Structure"))).click()
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true")
  await until(() => box("1")?.getAttribute("aria-selected") == "true")
})

it("opens on a structure box from the keyboard and shows its node in the Tree", async () => {
  await setup()
  ;(await until(() => tab("Structure"))).click()
  const target = await until(() => box("2"))
  target.click()
  await userEvent.keyboard("{Shift>}{F10}{/Shift}")
  ;(await until(() => item("Show in Tree"))).click()
  await until(() => tab("Tree")?.getAttribute("aria-selected") == "true")
  await until(() => treeRow("2") && shadow().activeElement == treeRow("2"))
})

it("scrolls the node into view and copies its path and JSON", async () => {
  const inner = inPageTransport()
  const sent: string[] = []
  const transport: Transport = {
    send: request => {
      sent.push(request.type)
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  const copied: string[] = []
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async text => {
    copied.push(text)
  })
  const row = await setup(transport)
  rightClick(row)
  ;(await until(() => item("Scroll into view in the page"))).click()
  await until(() => sent.includes("scrollIntoView"))
  rightClick(row)
  ;(await until(() => item("Copy path"))).click()
  await until(() => copied.includes("[1]"))
  rightClick(row)
  ;(await until(() => item("Copy JSON"))).click()
  await until(() => copied.some(text => text.includes('"type": "Paragraph"')))
})

it("shows the node's type in the Schema, and logs the node in the console", async () => {
  const logged: unknown[][] = []
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  const row = await setup()
  rightClick(row)
  ;(await until(() => item("Log to the page's console"))).click()
  await until(() => logged.some(args => String(args[0]).includes("Paragraph at [1]")))
  rightClick(row)
  ;(await until(() => item("Show Paragraph type in Schema"))).click()
  await until(() => tab("Schema")?.getAttribute("aria-selected") == "true")
  await until(() => shadow().querySelector("[data-type='node-Paragraph']"))
})
