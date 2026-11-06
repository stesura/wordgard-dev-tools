import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Node, Plot} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {GardState} from "wordgard/state"
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

const section = (name: string) => shadow().querySelector<HTMLElement>(`section[aria-label='${name}']`)
const toggle = (scope: ParentNode, text: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")].find(b => b.textContent == text)

it("shows nodes or marks only, filters them by tag, and orders marks by rank", async () => {
  await setup()
  toggle(shadow(), "3 marks")?.click()
  await until(() => !section("Nodes") && section("Marks"))
  toggle(shadow(), "3 marks")?.click()
  await until(() => section("Nodes") && section("Marks"))

  const nodes = await until(() => section("Nodes"))
  toggle(nodes, "textblock")?.click()
  await until(() => !card("node-Text"))
  expect([...nodes.querySelectorAll("[data-type^='node-']")].map(c => c.getAttribute("data-type"))).toEqual([
    "node-Paragraph",
    "node-Heading",
  ])
  toggle(nodes, "defining")?.click()
  await until(() => !card("node-Paragraph") && card("node-Heading"))

  const marks = await until(() => section("Marks"))
  const order = () => [...marks.querySelectorAll("[data-type^='mark-']")].map(c => c.getAttribute("data-type"))
  expect(order()).toEqual(["mark-Strong", "mark-Emphasis", "mark-Link"])
  toggle(marks, "rank")?.click()
  await until(() => order()[0] == "mark-Link")
  expect(order()).toEqual(["mark-Link", "mark-Emphasis", "mark-Strong"])
  toggle(marks, "inclusive")?.click()
  await until(() => !card("mark-Link"))
})

it("rings the card a link or a click lands on", async () => {
  await setup()
  ;[...(card("mark-Strong")?.querySelectorAll("button") ?? [])].find(b => b.textContent == "Text")?.click()
  await until(() => card("node-Text")?.className.includes("ring-2"))
  expect(card("mark-Strong")?.className).not.toContain("ring-2")
  card("node-Paragraph")?.click()
  await until(() => card("node-Paragraph")?.className.includes("ring-2"))
  expect(card("node-Text")?.className).not.toContain("ring-2")
})

it("clears the filters with their ×", async () => {
  await setup()
  toggle(shadow(), "3 marks")?.click()
  await until(() => !section("Nodes"))
  shadow().querySelector<HTMLButtonElement>("[aria-label='Show nodes and marks']")?.click()
  await until(() => section("Nodes"))
  const nodes = await until(() => section("Nodes"))
  toggle(nodes, "textblock")?.click()
  await until(() => !card("node-Text"))
  nodes.querySelector<HTMLButtonElement>("[aria-label='Clear the nodes filters']")?.click()
  await until(() => card("node-Text"))
  expect(nodes.querySelector("[aria-label='Clear the nodes filters']")).toBeNull()
})
