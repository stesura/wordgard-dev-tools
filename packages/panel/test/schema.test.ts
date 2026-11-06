import {afterEach, expect, it, vi} from "vitest"
import {userEvent} from "vitest/browser"
import {Node, Plot, Schema} from "wordgard/doc"
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

it("collapses nodes or marks, filters them by tag, and orders marks by rank", async () => {
  await setup()
  toggle(shadow(), "3 marks")?.click()
  await until(() => !card("mark-Strong") && card("node-Paragraph"))
  toggle(shadow(), "3 marks")?.click()
  await until(() => card("node-Paragraph") && card("mark-Strong"))

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

it("clears every filter at once, and a section's tags with their ×", async () => {
  await setup()
  const clearAll = () => [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent == "Clear filters")
  expect(clearAll()).toBeUndefined()
  toggle(shadow(), "3 marks")?.click()
  await until(() => !card("mark-Strong"))
  const filter = await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']"))
  await userEvent.fill(filter, "Para")
  toggle(section("Nodes") ?? shadow(), "textblock")?.click()
  await until(() => !card("node-Heading"))
  clearAll()?.click()
  await until(() => card("mark-Strong") && card("node-Text") && card("node-Heading"))
  expect(filter.value).toBe("")
  expect(clearAll()).toBeUndefined()
  const nodes = await until(() => section("Nodes"))
  toggle(nodes, "textblock")?.click()
  await until(() => !card("node-Text"))
  nodes.querySelector<HTMLButtonElement>("[aria-label='Clear the nodes filters']")?.click()
  await until(() => card("node-Text"))
  expect(nodes.querySelector("[aria-label='Clear the nodes filters']")).toBeNull()
})

it("collapses a section to its bar from its title or the bar's empty stretch, and the toolbar shows which are open", async () => {
  await setup()
  const bar = (name: string) => section(name)?.querySelector<HTMLElement>("[data-heading]")
  const stretch = (name: string) => section(name)?.querySelector<HTMLElement>("[data-collapse]")
  const marksToggle = () => [...shadow().querySelectorAll("button[aria-pressed]")].find(b => b.textContent?.endsWith(" marks"))
  expect(marksToggle()?.getAttribute("aria-pressed")).toBe("true")
  // The bar itself and its "order" label don't toggle.
  bar("Marks")?.click()
  ;[...(bar("Marks")?.querySelectorAll("span") ?? [])].find(span => span.textContent == "order")?.click()
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(card("mark-Strong")).not.toBeNull()
  stretch("Marks")?.click()
  await until(() => !card("mark-Strong"))
  expect(card("node-Paragraph")).not.toBeNull()
  expect(bar("Marks")).not.toBeNull()
  expect(marksToggle()?.getAttribute("aria-pressed")).toBe("false")
  // A tag in the bar filters; it doesn't collapse the section.
  toggle(section("Nodes") ?? shadow(), "textblock")?.click()
  await until(() => !card("node-Text"))
  expect(card("node-Paragraph")).not.toBeNull()
  section("Marks")?.querySelector<HTMLButtonElement>("[aria-label='Expand the marks']")?.click()
  await until(() => card("mark-Strong"))
  stretch("Nodes")?.click()
  await until(() => !card("node-Paragraph") && card("mark-Strong"))
})

it("puts the filter on its own line in a narrow panel", async () => {
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "right", size: 300, collapsed: false}))
  await setup()
  const filter = await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']"))
  const marks = await until(() => [...shadow().querySelectorAll("button[aria-pressed]")].find(b => b.textContent?.endsWith(" marks")))
  expect(marks.getBoundingClientRect().top).toBeGreaterThanOrEqual(filter.getBoundingClientRect().bottom)
})

it("lists the node groups, linked both ways", async () => {
  const paragraph = await setup()
  const textblock = await until(() => card("group-Textblock"))
  expect(textblock.textContent).toContain("Wordgard's")
  expect(textblock.textContent).toMatch(/types.*Paragraph/)
  // The document's content names Content.
  expect(card("group-Content")?.textContent).toMatch(/content of.*Doc/)
  expect(card("group-Block")?.textContent).toContain("automatic")
  // Wordgard assigns Textblock itself.
  expect(textblock.textContent).toContain("automatic")
  // From a node's groups (Textblock not among them) to the group's card.
  expect([...paragraph.querySelectorAll("button")].some(button => button.textContent == "Textblock")).toBe(false)
  ;[...paragraph.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent == "Content")?.click()
  await until(() => card("group-Content")?.getAttribute("aria-current") == "true")
  // From the group's card to a node's.
  ;[...textblock.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent == "Heading")?.click()
  await until(() => card("node-Heading")?.getAttribute("aria-current") == "true")
})

it("shows the selected type's spec as JSON beside the list", async () => {
  const paragraph = await setup()
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']")
  expect(spec()?.textContent).toContain("Select a node type")
  paragraph.click()
  await until(() => spec()?.textContent?.includes("Paragraphnode type"))
  expect(spec()?.querySelector("pre")?.textContent).toContain('"inlineContent": true')
  ;(await until(() => card("mark-Strong"))).click()
  await until(() => spec()?.textContent?.includes("Strongmark type"))
  const logged: unknown[][] = []
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  spec()?.querySelector<HTMLButtonElement>(`[aria-label="Log the Strong mark type to the page's console"]`)?.click()
  await until(() => logged.some(args => args[0] == "[wordgard-devtools] the Strong mark type"))
  log.mockRestore()
  ;(await until(() => card("group-Textblock"))).click()
  await until(() => spec()?.textContent?.includes("Textblocknode group"))
})

const item = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(element => element.textContent?.trim() == text)

const rightClick = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect()
  element.dispatchEvent(
    new MouseEvent("contextmenu", {bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4, button: 2}),
  )
}

it("closes the JSON pane, and shows it again on a double click or from a card's menu", async () => {
  const paragraph = await setup()
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']")
  ;(await until(() => spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']"))).click()
  await until(() => !spec())
  paragraph.dispatchEvent(new MouseEvent("dblclick", {bubbles: true}))
  await until(() => spec()?.textContent?.includes("Paragraphnode type"))
  spec()?.querySelector<HTMLButtonElement>("[aria-label='Close the JSON']")?.click()
  await until(() => !spec())

  const copied: string[] = []
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async text => {
    copied.push(text)
  })
  const logged: unknown[][] = []
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args)
  })
  const strong = await until(() => card("mark-Strong"))
  rightClick(strong)
  ;(await until(() => item("Show JSON"))).click()
  await until(() => spec()?.textContent?.includes("Strongmark type"))
  // The pane is open: no "Show JSON".
  rightClick(strong)
  await until(() => item("Log JSON"))
  expect(item("Show JSON")).toBeUndefined()
  ;(await until(() => item("Log JSON"))).click()
  await until(() => logged.some(args => args[0] == "[wordgard-devtools] the Strong mark type's spec"))
  rightClick(strong)
  ;(await until(() => item("Copy JSON"))).click()
  await until(() => copied.some(text => text.includes('"name": "Strong"')))
  // A group has no live object to log: only its JSON.
  const group = await until(() => card("group-Content"))
  rightClick(group)
  await until(() => item("Log JSON"))
  expect(item("Log to console")).toBeUndefined()
  ;(await until(() => item("Log JSON"))).click()
  await until(() => logged.some(args => args[0] == "[wordgard-devtools] the Content node group"))
  vi.restoreAllMocks()
})

it("switches a type's JSON between its spec and what applies", async () => {
  const paragraph = await setup()
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']")
  const toggle = (name: string) =>
    [...(spec()?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])].find(button => button.textContent == name)
  paragraph.click()
  ;(await until(() => toggle("Effective"))).click()
  // Not in Paragraph's spec: noted.
  await until(() => spec()?.textContent?.includes('"isolating": false,  // default'))
  expect(spec()?.textContent).toContain("// from the schema")
  const copied: string[] = []
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async text => {
    copied.push(text)
  })
  spec()?.querySelector<HTMLButtonElement>("[aria-label='Copy the JSON']")?.click()
  // The values, without the comments.
  await until(() => copied.some(text => JSON.parse(text).isolating === false))
  // The view stays with the next type; a group has only one.
  ;(await until(() => card("mark-Strong"))).click()
  await until(() => spec()?.textContent?.includes('"spanning"'))
  ;(await until(() => card("group-Content"))).click()
  await until(() => spec()?.textContent?.includes("Contentnode group"))
  expect(toggle("Effective")).toBeUndefined()
  vi.restoreAllMocks()
})

it("explains each section from its bar", async () => {
  await setup()
  const popup = () => shadow().querySelector<HTMLElement>("[data-slot='popover-content']")
  const sections = [
    {label: "About the nodes", text: "Each node type in the schema", link: "#doc.Plot.Spec.defining"},
    {label: "About the marks", text: "Each mark type", link: "#doc.Mark.Spec.inclusive"},
    {label: "About the node groups", text: "Groups are used to specify parent-child relationships between nodes", link: "#doc.Node.Group.Textblock"},
  ]
  for (const {label, text, link} of sections) {
    ;(await until(() => shadow().querySelector<HTMLButtonElement>(`[aria-label='${label}']`))).click()
    await until(() => popup()?.textContent?.includes(text))
    // Terms link to their entry in Wordgard's reference.
    expect(popup()?.querySelector(`a[href$='${link}']`)).not.toBeNull()
    await userEvent.keyboard("{Escape}")
    await until(() => !popup())
  }
})

it("explains spec and effective, for a node type or a mark type, and not for a group", async () => {
  const paragraph = await setup()
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']")
  const guide = () => spec()?.querySelector<HTMLButtonElement>("[aria-label='About spec and effective']")
  const popup = () => shadow().querySelector<HTMLElement>("[data-slot='popover-content']")
  paragraph.click()
  ;(await until(() => guide())).click()
  await until(() => popup()?.textContent?.includes("Spec is the node type as defined"))
  await userEvent.keyboard("{Escape}")
  await until(() => !popup())
  ;(await until(() => card("mark-Strong"))).click()
  ;(await until(() => guide())).click()
  await until(() => popup()?.textContent?.includes("Spec is the mark type as defined"))
  await userEvent.keyboard("{Escape}")
  await until(() => !popup())
  ;(await until(() => card("group-Content"))).click()
  await until(() => spec()?.textContent?.includes("Contentnode group"))
  expect(guide()).toBeNull()
})

it("flags a type an override changes: an amber switch and a note", async () => {
  // A type of this file's (here, wordgard/types can be another copy than basicSchema's), and a group
  // Wordgard names (one only an override mentions isn't seen).
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [
      basicSchema(),
      GardState.schemaElement.of([Callout, Schema.Override.nodeGroup(Callout, [Node.Group.Content, Node.Group.ListItem])]),
      wordgardDevtools({name: "s"}),
    ],
  })
  mounted = mountDevtools()
  await mounted.ready
  ;(await until(() => tab("Schema"))).click()
  const spec = () => shadow().querySelector<HTMLElement>("[aria-label='Spec']")
  const note = () => spec()?.querySelector<HTMLElement>("[role='note']")
  const effectiveButton = () =>
    [...(spec()?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])].find(button => button.textContent == "Effective")
  ;(await until(() => card("node-Callout"))).click()
  await until(() => note()?.textContent?.includes("An override changes what applies: group"))
  expect(effectiveButton()?.className).toContain("amber")
  ;[...(note()?.querySelectorAll("button") ?? [])].find(button => button.textContent == "See the effective view")?.click()
  await until(() => note()?.textContent?.includes("Highlighted"))
  expect(effectiveButton()?.getAttribute("aria-pressed")).toBe("true")
  // A type no override touches: neither.
  ;(await until(() => card("node-Heading"))).click()
  await until(() => spec()?.textContent?.includes("Headingnode type"))
  expect(note()).toBeNull()
  expect(effectiveButton()?.className).not.toContain("amber")
})

it("saves the filters, and reads them back, leaving out tags this schema doesn't have", async () => {
  await setup()
  const nodes = await until(() => section("Nodes"))
  toggle(nodes, "textblock")?.click()
  toggle(shadow(), "3 marks")?.click()
  await until(() => !card("node-Text") && !card("mark-Strong"))
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:schema-filters") ?? "null")).toEqual({
    query: "",
    open: {node: true, mark: false, group: true},
    nodes: ["textblock"],
    marks: [],
    groups: [],
  })
  mounted?.unmount()
  wg?.dom.remove()

  localStorage.setItem(
    "wordgard-devtools:schema-filters",
    JSON.stringify({query: "Para", open: {node: true}, nodes: ["textblock", "no-such-tag"], marks: [], groups: []}),
  )
  await setup()
  await until(() => card("node-Paragraph") && !card("node-Heading"))
  expect(toggle(section("Nodes") ?? shadow(), "textblock")?.getAttribute("aria-pressed")).toBe("true")
  expect(shadow().querySelector<HTMLInputElement>("[aria-label='Filter the types']")?.value).toBe("Para")
  ;[...shadow().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent == "Clear filters")?.click()
  await until(() => card("node-Heading") && card("node-Text"))
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:schema-filters") ?? "null")?.nodes).toEqual([])
})
