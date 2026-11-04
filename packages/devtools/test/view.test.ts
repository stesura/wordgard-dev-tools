import {afterEach, expect, it, vi} from "vitest"
import {Decoration, Widget, Wordgard} from "wordgard/editor"
import {Paragraph} from "wordgard/types"
import {type ViewNode, wordgardDevtools} from "../src/index.ts"
import {ask, editor, registry} from "./helpers.ts"

const editors: Wordgard[] = []
afterEach(async () => {
  if (editors.length) await ask({type: "highlight", id: 0, path: null})
  for (const wg of editors.splice(0)) wg.dom.remove()
})

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0
const overlay = () => document.querySelector<HTMLElement>("[data-wordgard-devtools-overlay]")

const find = (node: ViewNode, test: (node: ViewNode) => boolean): ViewNode | null =>
  test(node) ? node : node.children.reduce<ViewNode | null>((found, child) => found ?? find(child, test), null)

it("maps the content's DOM back to the document, and flags chrome", async () => {
  const badge = Decoration.Tag.widget(Paragraph, "start", Widget.create({render: () => document.createElement("b")}))
  const wg = editor([wordgardDevtools(), badge])
  editors.push(wg)
  const {status, dom} = await ask({type: "view", id: idOf(wg)})
  expect(status).toMatchObject({connected: true, editable: true, kind: "Wordgard", root: "document"})
  expect(dom.tag).toBe("wg-content")
  const heading = find(dom, n => n.node?.name == "Heading")
  expect(heading).toMatchObject({tag: "h1", node: {path: [0], from: 0, to: 7}})
  const text = find(dom, n => n.kind == "text" && n.text == "Title")
  expect(text?.pos).toBe(1)
  expect(find(dom, n => n.tag == "b" && n.chrome)).not.toBeNull()
})

it("outlines and logs a view element", async () => {
  const wg = editor(wordgardDevtools())
  editors.push(wg)
  await ask({type: "viewElement", id: idOf(wg), path: [0], action: "outline"})
  expect(overlay()?.textContent).toBe("h1")
  const log = vi.spyOn(console, "log").mockImplementation(() => {})
  await ask({type: "viewElement", id: idOf(wg), path: [1], action: "log"})
  expect(log.mock.calls[0]?.[1]).toBe(wg.contentDOM.children[1])
  log.mockRestore()
  await expect(ask({type: "viewElement", id: idOf(wg), path: [9], action: "log"})).rejects.toThrow("gone")
})

it("flags nothing as chrome in a read-only editor, and tells Wordgard from a subclass", async () => {
  const wg = editor([wordgardDevtools(), Wordgard.editable.of(false)])
  editors.push(wg)
  const {status, dom} = await ask({type: "view", id: idOf(wg)})
  expect(status.editable).toBe(false)
  expect(status.kind).toBe("Wordgard")
  expect(find(dom, n => n.chrome)).toBeNull()
})
