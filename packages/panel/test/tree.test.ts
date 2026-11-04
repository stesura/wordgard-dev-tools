import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "wordgard-devtools"
import {inPageTransport, mountDevtools, type MountedDevtools, type Transport} from "../src/index.ts"

// Heading 0–7, Paragraph 7–19 ("Alpha " 8–14, "bold" 14–18), Paragraph 19–25.
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

const row = (path: string) => shadow().querySelector<HTMLElement>(`[data-path='${path}']`)

/** The in-page transport, recording the requests it sends. */
const recording = () => {
  const inner = inPageTransport()
  const sent: unknown[] = []
  const transport: Transport = {
    send: request => {
      sent.push(request)
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  return {transport, sent}
}

const setup = async (transport?: Transport) => {
  wg = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name: "tree"})]})
  mounted = mountDevtools({transport})
  await mounted.ready
  await until(() => row("1"))
  return wg
}

const expand = async (path: string) => {
  const element = await until(() => row(path))
  if (element.getAttribute("aria-expanded") != "true") element.click()
  await until(() => row(path)?.getAttribute("aria-expanded") == "true")
}

it("loads levels as they're expanded", async () => {
  await setup()
  expect(row("1")?.textContent).toContain("Paragraph")
  expect(row("1.0")).toBeNull()
  await expand("1")
  const text = await until(() => row("1.0"))
  expect(text.textContent).toContain('"Alpha "')
  expect(row("1.1")?.textContent).toContain("Strong")
  expect(row("1.1")?.textContent).toContain("14–18")
})

it("refetches every expanded level in one request when the document changes", async () => {
  const {transport, sent} = recording()
  const editor = await setup(transport)
  await expand("0")
  await expand("1")
  sent.length = 0
  editor.dispatch({changes: {from: 8, insert: [Leaf.text("New ")]}})
  await until(() => row("1.0")?.textContent?.includes("New Alpha"))
  const children = sent.filter(r => typeof r == "object" && r != null && "type" in r && r.type == "children")
  expect(children).toHaveLength(1)
  expect(children[0]).toMatchObject({paths: [[], [0], [1]]})
})

it("collapses an expanded level whose path no longer resolves", async () => {
  const editor = await setup()
  await expand("2")
  editor.dispatch({changes: {from: 19, to: 25}})
  await until(() => !row("2"))
  editor.dispatch({changes: {from: 19, insert: [...editor.state.doc.content.slice(1, 2)]}})
  const back = await until(() => row("2"))
  expect(back.getAttribute("aria-expanded")).toBe("false")
})

it("marks the nodes holding the selection", async () => {
  const editor = await setup()
  editor.dispatch({selection: {anchor: 9}})
  await until(() => row("1")?.dataset.selection == "holds")
  expect(row("0")?.dataset.selection).toBeUndefined()
  await expand("1")
  await until(() => row("1.0")?.dataset.selection == "innermost")
  expect(shadow().querySelector("[aria-label='Selection']")?.textContent).toContain("anchor 9")
})

it("reveals the selection", async () => {
  const editor = await setup()
  editor.dispatch({selection: {anchor: 16}})
  await until(() => row("1")?.dataset.selection == "holds")
  const reveal = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("button")].find(b => b.textContent?.includes("Reveal")),
  )
  reveal.click()
  const target = await until(() => row("1.1"))
  await until(() => shadow().activeElement == target)
  expect(target.dataset.selection).toBe("innermost")
})

it("shows the focused node in the side pane", async () => {
  await setup()
  await expand("1")
  const pane = await until(() => shadow().querySelector("[aria-label='Node']"))
  await until(() => pane.textContent?.includes('"type": "Paragraph"'))
  expect(pane.textContent).toContain("7–19")
  ;(await until(() => row("1.1"))).click()
  await until(() => pane.textContent?.includes('text"bold"'))
  expect(pane.textContent).toContain("markStrong")
})

it("searches the loaded nodes", async () => {
  await setup()
  await expand("1")
  // A real click: it moves DOM focus to the row, which takes the keys.
  await userEvent.click(await until(() => row("1.0")))
  // At a typist's pace: the first key opens the search input, which takes the next ones once
  // rendered. Playwright's own pace outruns that render.
  for (const key of "bol") {
    await userEvent.keyboard(key)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  const input = await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Search loaded nodes']"))
  expect(input.value).toBe("bol")
  await until(() => row("1.1")?.className.includes("bg-yellow"))
  expect(row("1.0")?.className).not.toContain("bg-yellow")
})

it("reloads a collapsed level that changed while collapsed", async () => {
  const editor = await setup()
  await expand("1")
  row("1")?.click()
  await until(() => !row("1.0"))
  editor.dispatch({changes: {from: 8, insert: [Leaf.text("New ")]}})
  await until(() => row("1")?.textContent?.includes("New Alpha"))
  await expand("1")
  await until(() => row("1.0")?.textContent?.includes('"New Alpha "'))
  expect(row("1.0")?.textContent).toContain("8–18")
})

it("loads a level again after its node was deleted and another took its place", async () => {
  const editor = await setup()
  await expand("2")
  await until(() => row("2.0"))
  editor.dispatch({changes: {from: 19, to: 25}})
  await until(() => !row("2"))
  editor.dispatch({changes: {from: 19, insert: [...editor.state.doc.content.slice(1, 2)]}})
  await until(() => row("2"))
  await expand("2")
  await until(() => row("2.0")?.textContent?.includes('"Alpha "'))
})

it("shows a failed load with a retry, and recovers", async () => {
  const inner = inPageTransport()
  let fail = true
  const transport: Transport = {
    send: async request => {
      if (fail && request.type == "children") throw new Error("The page didn't answer")
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  wg = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name: "tree"})]})
  mounted = mountDevtools({transport})
  await mounted.ready
  const alert = await until(() =>
    [...shadow().querySelectorAll("[role='alert']")].find(a => a.textContent?.includes("Couldn't load the tree")),
  )
  fail = false
  const retry = await until(() => [...alert.querySelectorAll("button")].find(b => b.textContent == "Retry"))
  retry.click()
  await until(() => row("1"))
  expect(shadow().textContent).not.toContain("Couldn't load the tree")
})

it("moves focus to the parent when the focused node is deleted", async () => {
  const editor = await setup()
  await expand("1")
  ;(await until(() => row("1.1"))).click()
  const pane = await until(() => shadow().querySelector("[aria-label='Node']"))
  await until(() => pane.textContent?.includes('text"bold"'))
  editor.dispatch({changes: {from: 14, to: 18}})
  await until(() => pane.textContent?.includes('"type": "Paragraph"'))
  expect(pane.textContent).not.toContain("No node at path")
})

it("keeps the rows up when a refresh fails", async () => {
  const inner = inPageTransport()
  let fail = false
  const transport: Transport = {
    send: async request => {
      if (fail && request.type == "children") throw new Error("The page didn't answer")
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  const editor = await setup(transport)
  await expand("1")
  fail = true
  editor.dispatch({changes: {from: 1, insert: [Leaf.text("A ")]}})
  await until(() => shadow().textContent?.includes("Couldn't load the tree"))
  expect(row("1.0")?.textContent).toContain('"Alpha "')
  fail = false
  editor.dispatch({changes: {from: 1, insert: [Leaf.text("B ")]}})
  await until(() => row("0")?.textContent?.includes("B A Title"))
  expect(shadow().textContent).not.toContain("Couldn't load the tree")
})
