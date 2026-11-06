import {afterEach, expect, it} from "vitest"
import {userEvent} from "vitest/browser"
import {Wordgard} from "wordgard/editor"
import {PROTOCOL, SOURCE, wordgardDevtools, type Push} from "../src/index.ts"
import {agent, ask, editor, registry} from "./helpers.ts"

const editors: Wordgard[] = []
const extra: Element[] = []

const open = (...args: Parameters<typeof editor>) => {
  const wg = editor(...args)
  editors.push(wg)
  return wg
}

afterEach(async () => {
  await ask({type: "pick", on: false})
  await ask({type: "highlight", id: 0, path: null})
  for (const wg of editors.splice(0)) wg.dom.remove()
  for (const element of extra.splice(0)) element.remove()
})

const overlay = () => document.querySelector<HTMLElement>("[data-wordgard-devtools-overlay]")
const boxes = () => [...(overlay()?.children ?? [])].filter(child => !child.textContent)
const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0

const nextPush = (type: Push["type"]) =>
  new Promise<Push>(resolve => {
    const stop = agent().onPush(push => {
      if (push.type != type) return
      stop()
      resolve(push)
    })
  })

const settle = () => new Promise(resolve => setTimeout(resolve, 30))

it("outlines a block node with its element's box, outside the editor", async () => {
  const wg = open(wordgardDevtools())
  await ask({type: "highlight", id: idOf(wg), path: [1]})
  const element = wg.nodeDOM(7)
  if (!element) throw new Error("No paragraph element")
  const rect = element.getBoundingClientRect()
  expect(boxes()).toHaveLength(1)
  expect(boxes()[0]?.getBoundingClientRect().toJSON()).toEqual(rect.toJSON())
  expect(overlay()?.textContent).toBe("Paragraph")
  expect(wg.contentDOM.contains(overlay())).toBe(false)
  expect(getComputedStyle(overlay() ?? document.body).pointerEvents).toBe("none")
  await ask({type: "highlight", id: idOf(wg), path: null})
  expect(overlay()).toBeNull()
})

it("outlines a wrapped text leaf line by line", async () => {
  const wg = open(wordgardDevtools(), `<p>${"word ".repeat(40)}</p>`)
  wg.dom.style.width = "200px"
  wg.flush()
  await ask({type: "highlight", id: idOf(wg), path: [0, 0]})
  expect(boxes().length).toBeGreaterThan(3)
  expect(overlay()?.textContent).toBe("Text")
})

it("replies with an error for a path that doesn't resolve", async () => {
  const wg = open(wordgardDevtools())
  expect(await agent().request({type: "highlight", id: idOf(wg), path: [9]})).toEqual({
    ok: false,
    error: "No node at path [9]",
  })
})

it("picks the node under the pointer without moving the caret", async () => {
  const transactions: unknown[] = []
  const wg = open([wordgardDevtools(), Wordgard.transactionListener.of(trs => transactions.push(...trs))])
  const before = wg.state.selection
  await ask({type: "pick", on: true})
  const strong = wg.contentDOM.querySelector("strong")
  if (!strong) throw new Error("No strong element")
  await userEvent.hover(strong)
  await settle()
  expect(overlay()?.textContent).toBe("Text")
  const picked = nextPush("picked")
  await userEvent.click(strong)
  expect(await picked).toEqual({type: "picked", id: idOf(wg), path: [1, 1]})
  expect(wg.state.selection).toBe(before)
  expect(transactions).toEqual([])
  expect(overlay()).toBeNull()
  // Picking is over: a click selects again.
  await userEvent.click(strong)
  await settle()
  expect(transactions.length).toBeGreaterThan(0)
})

it("picks a block from its padding", async () => {
  const wg = open(wordgardDevtools())
  await ask({type: "pick", on: true})
  const heading = wg.nodeDOM(0)
  if (!heading) throw new Error("No heading element")
  const picked = nextPush("picked")
  const {height} = heading.getBoundingClientRect()
  await userEvent.click(heading, {position: {x: heading.clientWidth - 2, y: height / 2}})
  expect(await picked).toMatchObject({path: [0]})
})

it("lets clicks outside editors through", async () => {
  open(wordgardDevtools())
  const button = document.createElement("button")
  button.textContent = "outside"
  let clicked = false
  button.addEventListener("click", () => (clicked = true))
  document.body.append(button)
  extra.push(button)
  await ask({type: "pick", on: true})
  await userEvent.click(button)
  expect(clicked).toBe(true)
})

it("cancels on Escape", async () => {
  const wg = open(wordgardDevtools())
  await ask({type: "pick", on: true})
  const cancelled = nextPush("pickCancelled")
  await userEvent.keyboard("{Escape}")
  expect(await cancelled).toEqual({type: "pickCancelled"})
  // Listeners are gone: the editor takes clicks again.
  const before = wg.state.selection
  const text = wg.contentDOM.querySelector("p")
  if (!text) throw new Error("No paragraph")
  await userEvent.click(text)
  await settle()
  expect(wg.state.selection).not.toBe(before)
})

it("stops picking when the extension's panel goes away", async () => {
  const wg = open(wordgardDevtools())
  await ask({type: "pick", on: true})
  await ask({type: "highlight", id: idOf(wg), path: [1]})
  window.postMessage({source: SOURCE, v: PROTOCOL, kind: "detach"}, "*")
  await settle()
  expect(overlay()).toBeNull()
  const before = wg.state.selection
  const text = wg.contentDOM.querySelector("p")
  if (!text) throw new Error("No paragraph")
  await userEvent.click(text)
  await settle()
  expect(wg.state.selection).not.toBe(before)
})

it("picks the text leaf at its very first pixel", async () => {
  const wg = open(wordgardDevtools())
  await ask({type: "pick", on: true})
  const strong = wg.contentDOM.querySelector("strong")
  if (!strong) throw new Error("No strong element")
  const {height} = strong.getBoundingClientRect()
  for (const x of [0, 1, 2]) {
    await userEvent.hover(strong, {position: {x, y: height / 2}})
    await settle()
    expect(overlay()?.textContent).toBe("Text")
  }
})

it("leaves an editor's chrome outside its content alone", async () => {
  const wg = open(wordgardDevtools())
  wg.dom.style.padding = "20px"
  await ask({type: "pick", on: true})
  let reached = false
  wg.dom.addEventListener("mousedown", () => (reached = true))
  let picked = false
  const stop = agent().onPush(push => {
    if (push.type == "picked") picked = true
  })
  await userEvent.click(wg.dom, {position: {x: 5, y: 5}})
  await settle()
  stop()
  expect(reached).toBe(true)
  expect(picked).toBe(false)
})

it("tells every panel when picking stops without a pick", async () => {
  open(wordgardDevtools())
  await ask({type: "pick", on: true})
  const cancelled = nextPush("pickCancelled")
  await ask({type: "pick", on: false})
  expect(await cancelled).toEqual({type: "pickCancelled"})
})

it("keeps a clicked node's outline while the pointer moves off the editors in pick mode", async () => {
  const wg = open(wordgardDevtools())
  const button = document.createElement("button")
  button.textContent = "panel"
  document.body.append(button)
  extra.push(button)
  await ask({type: "pick", on: true})
  await ask({type: "highlight", id: idOf(wg), path: [1]})
  await userEvent.hover(button)
  await settle()
  expect(overlay()?.textContent).toBe("Paragraph")
})

it("scrolls a node into view in the page, without a transaction", async () => {
  const spacer = document.createElement("div")
  spacer.style.height = "3000px"
  document.body.prepend(spacer)
  extra.push(spacer)
  const transactions: unknown[] = []
  const wg = open([wordgardDevtools(), Wordgard.transactionListener.of(trs => transactions.push(...trs))])
  window.scrollTo(0, 0)
  const inView = (element: Element | null) => {
    const rect = element?.getBoundingClientRect()
    return rect != null && rect.top >= 0 && rect.bottom <= window.innerHeight
  }
  expect(inView(wg.nodeDOM(7))).toBe(false)
  await ask({type: "scrollIntoView", id: idOf(wg), path: [1, 1]})
  expect(inView(wg.nodeDOM(7))).toBe(true)
  expect(transactions).toEqual([])
  window.scrollTo(0, 0)
})

it("shows the pick icon over the editors while picking, and the editor's own cursor after", async () => {
  const wg = open(wordgardDevtools())
  const before = getComputedStyle(wg.contentDOM).cursor
  await ask({type: "pick", on: true})
  const picking = getComputedStyle(wg.contentDOM).cursor
  expect(picking).toMatch(/^url\("data:image\/svg\+xml,.+"\) 12 11, crosshair$/)
  const strong = wg.contentDOM.querySelector("strong")
  if (!strong) throw new Error("No strong element")
  expect(getComputedStyle(strong).cursor).toBe(picking)
  // Not over the rest of the page.
  expect(getComputedStyle(document.body).cursor).not.toBe(picking)
  await ask({type: "pick", on: false})
  expect(getComputedStyle(wg.contentDOM).cursor).toBe(before)
})
