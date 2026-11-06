import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {Transaction} from "wordgard/state"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools, type RequestType} from "@stesura/wordgard-dev-tools"
import {inPageTransport, mountDevtools, type MountedDevtools, type Transport} from "../src/index.ts"

const doc = "<h1>Title</h1><p>Alpha</p>"

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
const button = (text: string) =>
  [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() == text)
const list = () => shadow().querySelector<HTMLElement>("[role='listbox'][aria-label='Transactions']")
const rows = () => [...(list()?.querySelectorAll<HTMLElement>("[role='option']") ?? [])]
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Transaction']")

/** The in-page transport, keeping the requests sent: their type, and `from` for `log`. */
const recordingTransport = () => {
  const inner = inPageTransport()
  const sent: {type: RequestType; from?: number}[] = []
  const transport: Transport = {
    send: request => {
      sent.push({type: request.type, from: "from" in request ? request.from : undefined})
      return inner.send(request)
    },
    onPush: listener => inner.onPush(listener),
  }
  return {transport, sent}
}

const setup = async (transport?: Transport) => {
  const editor = Wordgard.create({parent: document.body, doc, config: [basicSchema(), wordgardDevtools({name: "l"})]})
  wg = editor
  // Tall enough for the list above the entry pane.
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({side: "bottom", size: 640, collapsed: false}))
  mounted = mountDevtools({transport})
  await mounted.ready
  ;(await until(() => tab("Log"))).click()
  await until(() => shadow().textContent?.includes("Not recording"))
  return editor
}

const type = (editor: Wordgard, text: string) =>
  editor.dispatch({changes: {from: 1, insert: [Leaf.text(text)]}, userEvent: "input.type"})

it("records transactions while recording, with their timing", async () => {
  const editor = await setup()
  type(editor, "a")
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  type(editor, "b")
  editor.dispatch({selection: {anchor: 2}})
  await until(() => rows().length == 2)
  const [first, second] = rows()
  expect(first?.textContent).toContain("input.type")
  expect(first?.textContent).toContain("doc")
  expect(second?.textContent).toContain("sel")
  // The flush's timing comes in after the rows.
  await until(() => rows()[0]?.querySelector("[data-flush]"))

  button("Pause")?.click()
  await until(() => button("Record"))
  type(editor, "c")
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(rows()).toHaveLength(2)
})

it("shows an entry's changes, selection and annotations", async () => {
  const editor = await setup()
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  // "Title" 1–6: replaces "it".
  editor.dispatch({changes: {from: 2, to: 4, insert: [Leaf.text("XY")]}, selection: {anchor: 4}, userEvent: "input"})
  ;(await until(() => rows()[0])).click()
  const shown = await until(() => pane()?.querySelector("[data-range]"))
  expect(shown.textContent).toContain("2–4 → 2–4")
  expect(shown.textContent).toContain("it")
  expect(shown.textContent).toContain("XY")
  expect(pane()?.textContent).toContain("userEvent")
  expect(pane()?.textContent).toContain('"anchor": 4')
})

it("loads only the rows it lacks, and clears", async () => {
  const {transport, sent} = recordingTransport()
  const editor = await setup(transport)
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  type(editor, "a")
  editor.flush()
  await until(() => rows().length == 1 && rows()[0]?.querySelector("[data-flush]"))
  sent.length = 0
  type(editor, "b")
  await until(() => rows().length == 2)
  const logs = sent.filter(r => r.type == "log")
  expect(logs.length).toBeGreaterThan(0)
  expect(logs.every(r => (r.from ?? 0) >= 1)).toBe(true)

  button("Clear")?.click()
  await until(() => rows().length == 0)
  type(editor, "c")
  await until(() => rows().length == 1)
  expect(rows()[0]?.textContent?.startsWith("2")).toBe(true)
})

it("doesn't load while another tab is shown", async () => {
  const {transport, sent} = recordingTransport()
  const editor = await setup(transport)
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  ;(await until(() => tab("State"))).click()
  sent.length = 0
  type(editor, "a")
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(sent.filter(r => r.type == "log")).toEqual([])
  ;(await until(() => tab("Log"))).click()
  await until(() => rows().length == 1)
})

it("starts over when the editor reconnects with a new log", async () => {
  const editor = await setup()
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
  type(editor, "a")
  await until(() => rows().length == 1)
  // Same instance, same id: the page dropped its log.
  editor.dom.remove()
  document.body.append(editor.dom)
  await until(() => button("Record") && rows().length == 0)
})

const note = Transaction.Annotation.define<string>()

const record = async () => {
  ;(await until(() => button("Record"))).click()
  await until(() => button("Pause"))
}

/** The rows' indices, in the order shown. */
const order = () => rows().map(row => Number(row.getAttribute("data-index")))

it("disables the filters while there are no transactions", async () => {
  const editor = await setup()
  const bar = await until(() => shadow().querySelector<HTMLElement>("[role='group'][aria-label='Filters']"))
  expect([...bar.querySelectorAll("button")].every(b => b.disabled || b.hasAttribute("data-disabled"))).toBe(true)
  await record()
  type(editor, "a")
  await until(() => rows().length == 1)
  await until(() => [...bar.querySelectorAll("button")].every(b => !b.disabled))
})

it("counts every annotation in the table, as the entry does", async () => {
  const editor = await setup()
  await record()
  type(editor, "a")
  const row = await until(() => rows()[0])
  // The time stamp and the user event.
  expect(row.children[5]?.textContent).toBe("2")
  row.click()
  await until(() => pane()?.textContent?.includes("Annotations (2)"))
})

it("filters by user event, what changed and annotation", async () => {
  const editor = await setup()
  await record()
  type(editor, "a")
  editor.dispatch({selection: {anchor: 2}, userEvent: "select.pointer"})
  editor.dispatch({selection: {anchor: 1}, annotations: note.of("n")})
  await until(() => rows().length == 3)

  // What changed: every flag on at first; one switched off hides the rows that only have it.
  const changed = () => [...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by what changed'] button")]
  expect(changed().map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "true", "true"])
  changed().find(b => b.textContent == "sel")?.click()
  await until(() => order().join() == "0")
  changed().find(b => b.textContent == "sel")?.click()
  changed().find(b => b.textContent == "doc")?.click()
  await until(() => order().join() == "1,2")

  // A custom annotation, listed by its number.
  const annotation = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by annotation'] button")].find(b => b.textContent?.startsWith("annotation #")),
  )
  annotation.click()
  await until(() => order().join() == "2")
  expect(shadow().textContent).toContain("1 of 3 transactions")
  button("Clear filters")?.click()
  await until(() => rows().length == 3)

  // A user event and the ones under it.
  ;(await until(() => shadow().querySelector<HTMLElement>("[aria-label='Filter by user event']"))).click()
  const option = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find(o => !list()?.contains(o) && o.textContent == "select"),
  )
  option.click()
  await until(() => order().join() == "1")
})

it("sorts by a column, ascending then descending", async () => {
  const editor = await setup()
  await record()
  type(editor, "a")
  editor.dispatch({selection: {anchor: 2}, annotations: note.of("n")})
  editor.dispatch({selection: {anchor: 1}})
  await until(() => rows().length == 3)
  const sortBy = (label: string) => shadow().querySelector<HTMLButtonElement>(`[aria-label='Sort by ${label}']`)
  sortBy("index")?.click()
  await until(() => order().join() == "2,1,0")
  sortBy("annotations")?.click()
  // Ascending, ties in log order: 2 has only the time stamp.
  await until(() => order().join() == "2,0,1")
  sortBy("annotations")?.click()
  await until(() => order().join() == "0,1,2")
})

it("skips select.pointer transactions when its box is unticked, and remembers it", async () => {
  const editor = await setup()
  await record()
  const box = await until(() =>
    [...shadow().querySelectorAll("label")].find(l => l.textContent?.includes("record select.pointer"))?.querySelector("input"),
  )
  expect(box.checked).toBe(true)
  box.click()
  await until(() => localStorage.getItem("wordgard-devtools:log-select-pointer") == "false")
  editor.dispatch({selection: {anchor: 2}, userEvent: "select.pointer"})
  type(editor, "a")
  await until(() => rows().length == 1)
  expect(rows()[0]?.textContent).toContain("input.type")
})

it("reads the saved select.pointer setting back, and records with it", async () => {
  localStorage.setItem("wordgard-devtools:log-select-pointer", "false")
  const editor = await setup()
  const box = await until(() =>
    [...shadow().querySelectorAll("label")].find(l => l.textContent?.includes("record select.pointer"))?.querySelector("input"),
  )
  expect(box.checked).toBe(false)
  await record()
  editor.dispatch({selection: {anchor: 2}, userEvent: "select.pointer"})
  type(editor, "a")
  await until(() => rows().length == 1)
  expect(rows()[0]?.textContent).toContain("input.type")
})

it("shows the what-changed toggles' tooltips", async () => {
  const editor = await setup()
  await record()
  type(editor, "a")
  await until(() => rows().length == 1)
  const doc = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by what changed'] button")].find(b => b.textContent == "doc"),
  )
  await userEvent.hover(doc)
  await until(() =>
    [...shadow().querySelectorAll("[data-slot='tooltip-content']")].some(t => t.textContent?.startsWith("Changed the document")),
  )
})
