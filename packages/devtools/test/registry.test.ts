import {afterEach, describe, expect, it, vi} from "vitest"
import {Leaf} from "wordgard/doc"
import {Wordgard} from "wordgard/editor"
import {blockquote} from "wordgard/schema"
import {GardState} from "wordgard/state"
import pkg from "../package.json" with {type: "json"}
import {PROTOCOL, SOURCE, VERSION, mismatch, wordgardDevtools, type StructureNode} from "../src/index.ts"
import {agent, ask, editor, nextMessage, post, pushes, registry} from "./helpers.ts"

const editors: Wordgard[] = []

const open = (...args: Parameters<typeof editor>) => {
  const wg = editor(...args)
  editors.push(wg)
  return wg
}

afterEach(() => {
  for (const wg of editors.splice(0)) wg.dom.remove()
})

const names = () => [...registry().editors.values()].map(e => e.name)

/** A structure node without its nesting. */
const shallow = ({children: _, text: __, ...node}: StructureNode) => node

describe("registry", () => {
  it("registers an editor while it is connected", () => {
    const wg = open(wordgardDevtools({name: "body"}))
    expect(registry().editors.get(wg)?.name).toBe("body")
    wg.dom.remove()
    expect(registry().editors.has(wg)).toBe(false)
    document.body.appendChild(wg.dom)
    expect(registry().editors.has(wg)).toBe(true)
  })

  it("keeps an editor's id across reconnects", () => {
    const wg = open(wordgardDevtools())
    const id = registry().editors.get(wg)?.id
    wg.dom.remove()
    document.body.appendChild(wg.dom)
    expect(registry().editors.get(wg)?.id).toBe(id)
  })

  it("names an editor from its aria-label, then by number", () => {
    const labelled = open([wordgardDevtools(), Wordgard.contentAttributes.of({"aria-label": "Notes"})])
    const plain = open(wordgardDevtools())
    expect(registry().editors.get(labelled)?.name).toBe("Notes")
    const entry = registry().editors.get(plain)
    expect(entry?.name).toBe(`editor #${entry?.id}`)
  })

  it("has one entry for an editor with two plugins", () => {
    const wg = open([wordgardDevtools(), wordgardDevtools({name: "app"})])
    expect(names()).toEqual(["app"])
    wg.dom.remove()
    expect(registry().editors.size).toBe(0)
  })

  it("keeps the entry until the last plugin is dropped", () => {
    const first = GardState.Compartment.define()
    const second = GardState.Compartment.define()
    const wg = open([first.of(wordgardDevtools()), second.of(wordgardDevtools({name: "second"}))])
    wg.dispatch({effects: first.reconfigure([])})
    wg.flush()
    expect(names()).toEqual(["second"])
    wg.dispatch({effects: second.reconfigure([])})
    wg.flush()
    expect(registry().editors.size).toBe(0)
  })

  it("registers a plugin added by a reconfigure while connected", () => {
    const slot = GardState.Compartment.define()
    const wg = open(slot.of([]))
    expect(window.__WORDGARD_DEVTOOLS__?.editors.has(wg) ?? false).toBe(false)
    wg.dispatch({effects: slot.reconfigure(wordgardDevtools({name: "added"}))})
    wg.flush()
    expect(registry().editors.get(wg)?.name).toBe("added")
    wg.dispatch({effects: slot.reconfigure(wordgardDevtools({name: "swapped"}))})
    wg.flush()
    expect(registry().editors.get(wg)?.name).toBe("swapped")
  })

  it("notifies subscribers", () => {
    const listener = vi.fn()
    const stop = registry().subscribe(listener)
    const wg = open(wordgardDevtools())
    wg.dom.remove()
    stop()
    open(wordgardDevtools())
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe("agent", () => {
  it("reports its version", async () => {
    open(wordgardDevtools({name: "a"}))
    expect(VERSION).toBe(pkg.version)
    const {agent: info, editors: list} = await ask({type: "listEditors"})
    expect(info).toEqual({version: VERSION, protocol: PROTOCOL})
    expect(list.map(e => e.name)).toEqual(["a"])
  })

  it("attaches the selected editor only", async () => {
    const a = open(wordgardDevtools())
    const b = open(wordgardDevtools())
    const idA = registry().editors.get(a)?.id ?? 0
    await ask({type: "select", id: idA})
    expect(registry().editors.get(a)?.attached).toBe(true)
    expect(registry().editors.get(b)?.attached).toBe(false)
    await ask({type: "select", id: null})
    expect(registry().editors.get(a)?.attached).toBe(false)
  })

  it("pushes state changes for the attached editor, once per update", async () => {
    const a = open([wordgardDevtools(), wordgardDevtools()])
    const b = open(wordgardDevtools())
    await ask({type: "select", id: registry().editors.get(a)?.id ?? 0})
    const {seen, stop} = pushes()
    a.dispatch({changes: {from: 1, insert: [Leaf.text("A ")]}})
    a.flush()
    b.dispatch({changes: {from: 1, insert: [Leaf.text("B ")]}})
    b.flush()
    a.dispatch({selection: {anchor: 2}})
    a.flush()
    stop()
    const id = registry().editors.get(a)?.id
    expect(seen).toEqual([
      {type: "stateChanged", id, docChanged: true, selectionSet: false, reconfigured: false},
      {type: "stateChanged", id, docChanged: false, selectionSet: true, reconfigured: false},
    ])
  })

  it("hands transactions to the log only while recording", async () => {
    const wg = open(wordgardDevtools())
    const recorded = vi.spyOn(agent(), "recorded")
    wg.dispatch({changes: {from: 1, insert: [Leaf.text("x")]}})
    expect(recorded).not.toHaveBeenCalled()
    const id = registry().editors.get(wg)?.id ?? 0
    await expect(ask({type: "record", id, on: true})).rejects.toThrow("Select the editor before recording")
    await ask({type: "select", id})
    await ask({type: "record", id, on: true})
    wg.dispatch({changes: {from: 1, insert: [Leaf.text("y")]}})
    expect(recorded).toHaveBeenCalledTimes(1)
    expect(recorded.mock.calls[0]?.[1]).toHaveLength(1)
    recorded.mockRestore()
    await ask({type: "select", id: null})
  })

  it("serialises nodes shallowly", async () => {
    const wg = open(wordgardDevtools())
    const id = registry().editors.get(wg)?.id ?? 0
    const doc = await ask({type: "structure", id})
    const top = doc.children.map(shallow)
    const paragraph = doc.children[1]?.children.map(shallow)
    expect(top).toEqual([
      {path: [0], name: "Heading", from: 0, to: 7, childCount: 1, marks: [], paramPreview: "1", textPreview: "Title"},
      {path: [1], name: "Paragraph", from: 7, to: 20, childCount: 2, marks: [], paramPreview: null, textPreview: "Hello world"},
    ])
    expect(paragraph?.map(n => [n.path, n.from, n.to, n.textPreview, n.marks])).toEqual([
      [[1, 0], 8, 14, "Hello ", []],
      [[1, 1], 14, 19, "world", [{name: "Strong", preview: null}]],
    ])
    expect(doc.children[1]?.children[0]?.children).toEqual([])
  })

  it("truncates previews and sends the full value on node()", async () => {
    const long = "x".repeat(200)
    const wg = open(wordgardDevtools(), `<p>${long}</p>`)
    const id = registry().editors.get(wg)?.id ?? 0
    const leaf = (await ask({type: "structure", id})).children[0]?.children[0]
    expect(leaf?.textPreview).toHaveLength(80)
    expect(leaf?.textPreview?.endsWith("…")).toBe(true)
    const detail = await ask({type: "node", id, path: [0, 0]})
    expect(detail.text).toBe(long)
    expect(detail.name).toBe("Text")
    expect(detail.json).toEqual({type: "Text", param: long})
    const paragraph = await ask({type: "node", id, path: [0]})
    expect(paragraph.json).toEqual({type: "Paragraph", content: [{type: "Text", param: long}]})
  })

  it("serialises the selection with the paths holding it", async () => {
    const wg = open(wordgardDevtools())
    wg.dispatch({selection: {anchor: 3, head: 16}})
    const sel = await ask({type: "selection", id: registry().editors.get(wg)?.id ?? 0})
    expect(sel).toMatchObject({anchor: 3, head: 16, from: 3, to: 16, empty: false, anchorPath: [0, 0], headPath: [1, 1]})
    expect(sel.json).toMatchObject({anchor: 3, head: 16})
  })

  it("sends the whole document nested", async () => {
    const wg = open(wordgardDevtools())
    const doc = await ask({type: "structure", id: registry().editors.get(wg)?.id ?? 0})
    const shape = (n: typeof doc): unknown => [n.name, n.from, n.to, n.children.map(shape)]
    expect(shape(doc)).toEqual([
      "Doc",
      0,
      20,
      [
        ["Heading", 0, 7, [["Text", 1, 6, []]]],
        ["Paragraph", 7, 20, [["Text", 8, 14, []], ["Text", 14, 19, []]]],
      ],
    ])
  })

  it("counts positions through nested plots", async () => {
    const wg = open([wordgardDevtools(), blockquote()], "<blockquote><p>Quoted <em>text</em></p></blockquote><p>After</p>")
    const id = registry().editors.get(wg)?.id ?? 0
    const doc = await ask({type: "structure", id})
    const top = doc.children
    const inner = doc.children[0]?.children[0]?.children
    expect(top?.map(n => [n.name, n.from, n.to])).toEqual([
      ["Blockquote", 0, 15],
      ["Paragraph", 15, 22],
    ])
    expect(inner?.map(n => [n.path, n.from, n.to, n.textPreview])).toEqual([
      [[0, 0, 0], 2, 9, "Quoted "],
      [[0, 0, 1], 9, 13, "text"],
    ])
    // Between two leaves: the plot. Between two blocks: the document.
    wg.dispatch({selection: {anchor: 9, head: 15}})
    expect(await ask({type: "selection", id})).toMatchObject({anchorPath: [0, 0], headPath: []})
  })

  it("replies with errors instead of throwing", async () => {
    const wg = open(wordgardDevtools())
    const id = registry().editors.get(wg)?.id ?? 0
    expect(await agent().request({type: "selection", id: 999})).toEqual({ok: false, error: "No editor with id 999"})
    expect(await agent().request({type: "node", id, path: [9]})).toEqual({ok: false, error: "No node at path [9]"})
    expect(await agent().request({type: "repro", id})).toEqual({
      ok: false,
      error: "Not implemented yet (plan phase 7)",
    })
  })
})

describe("postMessage", () => {
  it("answers requests and then pushes over postMessage", async () => {
    const wg = open(wordgardDevtools({name: "posted"}))
    const [reply] = await post({type: "listEditors"})
    expect(reply).toMatchObject({ok: true, value: {editors: [{name: "posted"}]}})
    const pushed = new Promise(resolve => {
      const listen = (event: MessageEvent) => {
        if (event.data?.kind != "push") return
        window.removeEventListener("message", listen)
        resolve(event.data.push)
      }
      window.addEventListener("message", listen)
    })
    wg.dom.remove()
    expect(await pushed).toEqual({type: "editorsChanged"})
  })

  it("announces itself when pinged", async () => {
    open(wordgardDevtools())
    const announced = nextMessage("announce")
    window.postMessage({source: SOURCE, v: PROTOCOL, kind: "ping"}, "*")
    expect(await announced).toMatchObject({v: PROTOCOL, agent: {version: VERSION, protocol: PROTOCOL}})
  })

  it("keeps the in-page panel's and the extension's editors apart", async () => {
    const a = open(wordgardDevtools())
    const b = open(wordgardDevtools())
    const id = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0
    await ask({type: "select", id: id(a)})
    await post({type: "select", id: id(b)})
    expect([registry().editors.get(a)?.attached, registry().editors.get(b)?.attached]).toEqual([true, true])
    window.postMessage({source: SOURCE, v: PROTOCOL, kind: "detach"}, "*")
    await new Promise(resolve => setTimeout(resolve, 20))
    expect([registry().editors.get(a)?.attached, registry().editors.get(b)?.attached]).toEqual([true, false])
    // Reconnected, the same instance is attached again.
    a.dom.remove()
    document.body.appendChild(a.dom)
    expect(registry().editors.get(a)?.attached).toBe(true)
  })

  it("detaches when the extension's panel goes away", async () => {
    const wg = open(wordgardDevtools())
    await post({type: "select", id: registry().editors.get(wg)?.id ?? 0})
    expect(registry().editors.get(wg)?.attached).toBe(true)
    window.postMessage({source: SOURCE, v: PROTOCOL, kind: "detach"}, "*")
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(registry().editors.get(wg)?.attached).toBe(false)
    // No more pushes over postMessage.
    let pushed = false
    const listen = (event: MessageEvent) => {
      if (event.data?.kind == "push") pushed = true
    }
    window.addEventListener("message", listen)
    wg.dom.remove()
    await new Promise(resolve => setTimeout(resolve, 20))
    window.removeEventListener("message", listen)
    expect(pushed).toBe(false)
  })

  it("replies to a protocol mismatch", async () => {
    expect(await post({type: "listEditors"}, PROTOCOL + 1)).toEqual([
      {ok: false, error: mismatch(PROTOCOL, PROTOCOL + 1)},
    ])
  })

  it("replies to unknown requests", async () => {
    const [reply] = await post(JSON.parse('{"type": "explode"}'))
    expect(reply).toEqual({ok: false, error: "Unknown request explode"})
  })
})
