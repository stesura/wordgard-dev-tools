import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Node, Plot} from "wordgard/doc"
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
const card = (key: string) => shadow().querySelector<HTMLElement>(`[data-type='${key}']`)

const Callout = Plot.define("Callout", {blockContent: Node.Group.Textblock, group: Node.Group.Content, shape: {element: "aside"}})

const setup = async () => {
  wg = Wordgard.create({parent: document.body, doc: "<p>Hi</p>", config: [basicSchema(), wordgardDevtools({name: "s"})]})
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("Schema"))).click()
  return until(() => card("node-Paragraph"))
}

it("shows the node and mark types", async () => {
  const paragraph = await setup()
  expect(paragraph.textContent).toContain("textblock")
  expect(paragraph.textContent).toContain("inline: any")
  expect(paragraph.textContent).toContain("<p>")
  expect(card("mark-Strong")?.textContent).toContain("goes onTextLineBreak")
})

it("filters the types, and follows a link to a type", async () => {
  await setup()
  const filter = await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']"))
  await userEvent.fill(filter, "Str")
  await until(() => !card("node-Paragraph"))
  expect(card("mark-Strong")).not.toBeNull()
  // The Strong card's link to Text clears the filter.
  ;[...(card("mark-Strong")?.querySelectorAll("button") ?? [])].find(b => b.textContent == "Text")?.click()
  await until(() => card("node-Text") && card("node-Paragraph"))
})

it("reloads when the configuration changes", async () => {
  await setup()
  wg?.dispatch({effects: GardState.appendConfig.of(GardState.schemaElement.of(Callout))})
  await until(() => card("node-Callout"))
})
