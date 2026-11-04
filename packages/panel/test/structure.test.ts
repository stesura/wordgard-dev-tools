import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {inPageTransport, mountDevtools, type MountedDevtools, type Transport} from "../src/index.ts"

// Heading 0–7 ("Title" 1–6), Paragraph 7–19 ("Alpha " 8–14, "bold" 14–18), Paragraph 19–25.
const doc = "<h1>Title</h1><p>Alpha <strong>bold</strong></p><p>Beta</p>"

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

const structure = () => shadow().querySelector<HTMLElement>("[aria-label='Document structure']")
const box = (path: string) => structure()?.querySelector<HTMLElement>(`[data-path='${path}']`)
const treeRow = (path: string) =>
  shadow().querySelector<HTMLElement>(`[role='tree'][aria-label='Document'] [data-path='${path}']`)
const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(element => element.textContent == name)
const pane = () => shadow().querySelector<HTMLElement>("[data-slot='tabs-content']:not([hidden]) [aria-label='Node']")

/** The in-page transport, counting `structure` and `scrollIntoView` requests. */
const counting = () => {
  const inner = inPageTransport()
  const counts = {structure: 0, scrollIntoView: 0}
  const transport: Transport = {
    send: request => {
      if (request.type == "structure") counts.structure++
      if (request.type == "scrollIntoView") counts.scrollIntoView++
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  return {transport, counts}
}

const setup = async (transport?: Transport) => {
  const editor = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name: "s"})]})
  wg = editor
  mounted = mountDevtools({transport})
  await mounted.ready
  await until(() => treeRow("1"))
  return editor
}

const showStructure = async () => {
  ;(await until(() => tab("Structure"))).click()
  return until(() => box("1.1"))
}

it("draws the document as nested boxes with positions", async () => {
  await setup()
  await showStructure()
  expect(box("0")?.textContent).toMatch(/^Heading.*0–7/)
  expect(box("0.0")?.textContent).toBe('"Title"1–6')
  expect(box("1")?.textContent).toContain("7–19")
  expect(box("1.1")?.textContent).toBe('"bold"Strong14–18')
  expect(box("")?.textContent).toMatch(/^Doc0–25/)
})

it("follows the document", async () => {
  const editor = await setup()
  await showStructure()
  editor.dispatch({changes: {from: 8, insert: [Leaf.text("New ")]}})
  await until(() => box("1.0")?.textContent == '"New Alpha "8–18')
  expect(box("2")?.textContent).toContain("23–29")
})

it("outlines a hovered box's node in the page and shows a clicked one", async () => {
  await setup()
  const strong = await showStructure()
  await userEvent.hover(strong)
  await until(() => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent == "Text")
  strong.click()
  await until(() => pane()?.textContent?.includes('text"bold"'))
  expect(strong.className).toContain("ring-2")
})

it("marks the boxes holding the selection", async () => {
  const editor = await setup()
  await showStructure()
  editor.dispatch({selection: {anchor: 16}})
  await until(() => box("1.1")?.dataset.selection == "innermost")
  expect(box("1")?.dataset.selection).toBe("holds")
  expect(box("0")?.dataset.selection).toBeUndefined()
  expect(box("")?.dataset.selection).toBeUndefined()
})

it("reveals a pick in the shown tab", async () => {
  const editor = await setup()
  await showStructure()
  ;(await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']"))).click()
  const strong = editor.contentDOM.querySelector("strong")
  if (!strong) throw new Error("No strong element")
  await userEvent.click(strong)
  await until(() => box("1.1")?.className.includes("ring-2"))
  await until(() => pane()?.textContent?.includes('text"bold"'))
  // The tree, hidden, didn't take it: nothing expanded there.
  ;(await until(() => tab("Tree"))).click()
  await until(() => treeRow("1"))
  expect(treeRow("1")?.getAttribute("aria-expanded")).toBe("false")
})

it("keeps the tree's expanded rows across tab switches", async () => {
  await setup()
  treeRow("1")?.click()
  await until(() => treeRow("1.0"))
  await showStructure()
  ;(await until(() => tab("Tree"))).click()
  // Rows render once the shown scroller is measured again.
  await until(() => treeRow("1.0"))
  expect(treeRow("1")?.getAttribute("aria-expanded")).toBe("true")
})

it("loads the structure only while its tab is shown", async () => {
  const {transport, counts} = counting()
  const editor = await setup(transport)
  editor.dispatch({changes: {from: 1, insert: [Leaf.text("A ")]}})
  await until(() => treeRow("0")?.textContent?.includes("A Title"))
  expect(counts.structure).toBe(0)
  await showStructure()
  expect(counts.structure).toBe(1)
  expect(box("0")?.textContent).toContain("0–9")
})

const searchBox = () => shadow().querySelector<HTMLInputElement>("[aria-label='Search the structure']")

it("searches text, names and params, and steps through the matches", async () => {
  await setup()
  await showStructure()
  const input = await until(() => searchBox())
  await userEvent.click(input)
  await userEvent.keyboard("bol")
  await until(() => box("1.1")?.className.includes("bg-yellow-500/40"))
  expect(input.parentElement?.textContent).toContain("1/1")
  await until(() => pane()?.textContent?.includes('text"bold"'))
  await userEvent.clear(input)
  await userEvent.keyboard("paragraph")
  await until(() => input.parentElement?.textContent?.includes("1/2"))
  await userEvent.keyboard("{Enter}")
  await until(() => input.parentElement?.textContent?.includes("2/2"))
  expect(box("2")?.firstElementChild?.className).toContain("bg-yellow-500/40")
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}")
  await until(() => input.parentElement?.textContent?.includes("1/2"))
})

it("walks the boxes with the arrow keys", async () => {
  await setup()
  await showStructure()
  // The header: the box's middle is its chips.
  await userEvent.click(await until(() => box("1")?.firstElementChild))
  await until(() => box("1")?.getAttribute("aria-selected") == "true")
  await userEvent.keyboard("{ArrowDown}")
  await until(() => box("1.0")?.getAttribute("aria-selected") == "true")
  expect(shadow().activeElement).toBe(box("1.0"))
  await userEvent.keyboard("{End}")
  await until(() => box("2.0")?.getAttribute("aria-selected") == "true")
})

it("scrolls a double-clicked node into view in the editor", async () => {
  const {transport, counts} = counting()
  await setup(transport)
  const strong = await showStructure()
  await userEvent.dblClick(strong)
  await until(() => counts.scrollIntoView == 1)
})

it("reveals a pick in another editor once its structure has loaded", async () => {
  await setup()
  await showStructure()
  const other = Wordgard.create({
    parent: document.body,
    doc: "<p>One</p><p>Two <em>three</em></p>",
    config: [basicSchema(), wordgardDevtools({name: "other"})],
  })
  try {
    ;(await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']"))).click()
    const em = other.contentDOM.querySelector("em")
    if (!em) throw new Error("No em element")
    await userEvent.click(em)
    await until(() => box("1.1")?.className.includes("ring-2") && box("1.1")?.textContent?.includes("three"))
  } finally {
    other.dom.remove()
  }
})

