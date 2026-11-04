import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {GardState} from "wordgard/state"
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
const line = (id: string) => shadow().querySelector<HTMLElement>(`[aria-label='State'] [data-line='${id}']`)
// In the State tab's panel: the Structure has buttons of the same names.
const button = (label: string) =>
  shadow()
    .querySelector("[aria-label='State']")
    ?.closest("[role='tabpanel']")
    ?.querySelector<HTMLButtonElement>(`[aria-label='${label}']`)

const setup = async () => {
  wg = Wordgard.create({parent: document.body, doc: "<p>Hi</p>", config: [basicSchema(), wordgardDevtools()]})
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "bottom", size: 640, collapsed: false}))
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("State"))).click()
  await until(() => line("$/doc/type"))
  return wg
}

it("shows the state as JSON, live", async () => {
  const editor = await setup()
  expect(line("$/doc/type")?.textContent).toBe('"type":"Doc"')
  expect(line("$/selection")?.getAttribute("aria-expanded")).toBe("true")
  expect(line("$/doc/content/0/content/0/param")?.textContent).toBe('"param":"Hi"')
  editor.dispatch({changes: {from: 1, insert: [Leaf.text("Oh ")]}})
  await until(() => line("$/doc/content/0/content/0/param")?.textContent == '"param":"Oh Hi"')
})

it("collapses and expands, all at once or by the keyboard", async () => {
  await setup()
  button("Collapse all")?.click()
  await until(() => !line("$/doc/type"))
  expect(line("$/doc")?.textContent).toContain("2 keys")
  button("Expand all")?.click()
  await until(() => line("$/doc/type"))
  await userEvent.click(await until(() => line("$/doc")))
  await userEvent.keyboard("{ArrowLeft}")
  await until(() => !line("$/doc/type"))
  await userEvent.keyboard("{ArrowRight}")
  await until(() => line("$/doc/type"))
  await userEvent.keyboard("{ArrowDown}")
  expect(line("$/doc/type")?.getAttribute("aria-selected")).toBe("true")
})

it("moves focus to an object it closes, and into an open one with ArrowRight", async () => {
  await setup()
  await userEvent.click(await until(() => line("$/doc/content/0/type")))
  button("Collapse all")?.click()
  await until(() => line("$/doc")?.getAttribute("aria-selected") == "true")
  button("Expand all")?.click()
  await userEvent.click(await until(() => line("$/doc/type")))
  line("$/doc")?.querySelector<HTMLButtonElement>("button[aria-label='Collapse']")?.click()
  await until(() => line("$/doc")?.getAttribute("aria-selected") == "true")
  await userEvent.keyboard("{ArrowRight}")
  await until(() => line("$/doc/type"))
  await userEvent.keyboard("{ArrowRight}")
  expect(line("$/doc/type")?.getAttribute("aria-selected")).toBe("true")
})

it("keeps keys with a slash apart", async () => {
  const odd = GardState.Field.define<number>({create: () => 1, update: v => v, toJSON: () => ({"a/b": 1, a: {b: 2}})})
  wg = Wordgard.create({parent: document.body, doc: "<p>Hi</p>", config: [basicSchema(), odd, wordgardDevtools({fields: {odd}})]})
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("State"))).click()
  await until(() => line("$/odd/a%2Fb"))
  expect(line("$/odd/a%2Fb")?.textContent).toBe('"a/b":1')
  expect(line("$/odd/a/b")?.textContent).toBe('"b":2')
})
