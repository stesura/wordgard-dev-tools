import {afterEach, expect, it} from "vitest"
import {Mark, Node, Plot, Schema} from "wordgard/doc"
import type {Wordgard} from "wordgard/editor"
import {GardState} from "wordgard/state"
import {Paragraph} from "wordgard/types"
import {wordgardDevtools} from "../src/index.ts"
import {ask, editor, registry} from "./helpers.ts"

const editors: Wordgard[] = []
afterEach(() => {
  for (const wg of editors.splice(0)) wg.dom.remove()
})

const schemaOf = (wg: Wordgard) => ask({type: "schema", id: registry().editors.get(wg)?.id ?? 0})

const Notes = Node.Group.define()
const Callout = Plot.Type.define<string>("Callout", {
  blockContent: [Node.Group.Textblock, Notes],
  group: [Node.Group.Content, Notes],
  defaultParam: "info",
  validate: "string",
  shape: {element: "aside", selector: "aside.callout"},
})
const Flagged = Mark.Type.define<boolean>("Flagged", {target: Paragraph, rank: 5, shape: {attribute: "data-flagged", value: () => "y"}})

it("lists the node and mark types, with what each holds and where marks go", async () => {
  const wg = editor([wordgardDevtools(), GardState.schemaElement.of([Callout, Flagged])])
  editors.push(wg)
  const schema = await schemaOf(wg)
  expect(schema.doc).toBe("Doc")
  expect(schema.lineBreak).toBe("LineBreak")
  const node = (name: string) => schema.nodes.find(n => n.name == name)
  expect(node("Paragraph")).toMatchObject({
    kind: "plot",
    inline: false,
    groups: ["Textblock", "Content"],
    content: "inline: any",
    holds: ["Text", "LineBreak"],
    marks: ["Flagged"],
    flags: ["textblock", "neutral", "canBeEmpty"],
    shape: "<p>",
  })
  expect(node("Text")).toMatchObject({kind: "leaf", inline: true, shape: "none", marks: ["Strong", "Emphasis", "Link"]})
  expect(node("LineBreak")?.roles).toEqual(["LineBreak"])
  // A custom group is numbered; a callout holds textblocks and other callouts.
  expect(node("Callout")).toMatchObject({
    groups: ["Content", "group #1"],
    content: "block: Textblock | group #1",
    param: {default: "info", validate: "string"},
    shape: "<aside> aside.callout",
  })
  expect(node("Callout")?.holds).toEqual(expect.arrayContaining(["Paragraph", "Heading", "Callout"]))
  expect(node("Doc")?.holds).toEqual(expect.arrayContaining(["Callout"]))

  const flagged = schema.marks.find(m => m.name == "Flagged")
  expect(flagged).toMatchObject({target: "Paragraph", targets: ["Paragraph"], rank: 5, shape: "[data-flagged]"})
  expect(schema.marks.find(m => m.name == "Link")).toMatchObject({param: {validate: "string"}, targets: ["Text", "LineBreak"]})
})

it("pushes reconfigured when the configuration changes", async () => {
  const wg = editor(wordgardDevtools())
  editors.push(wg)
  const id = registry().editors.get(wg)?.id ?? 0
  await ask({type: "select", id})
  const seen: unknown[] = []
  const stop = registry().agent?.onPush(push => push.type == "stateChanged" && seen.push(push.reconfigured))
  wg.dispatch({effects: GardState.appendConfig.of(GardState.schemaElement.of(Callout))})
  wg.flush()
  stop?.()
  expect(seen).toEqual([true])
  expect((await schemaOf(wg)).nodes.some(n => n.name == "Callout")).toBe(true)
  await ask({type: "select", id: null})
})

it("names a group an override applies, for the types listed before the query that names it", async () => {
  const Asides = Node.Group.define()
  const Box = Plot.define("Box", {blockContent: Asides, group: Node.Group.Content, shape: {element: "div"}})
  const wg = editor([
    wordgardDevtools(),
    GardState.schemaElement.of([Box, Schema.Override.nodeGroup(Paragraph, [Node.Group.Textblock, Node.Group.Content, Asides])]),
  ])
  editors.push(wg)
  const schema = await schemaOf(wg)
  expect(schema.nodes.find(n => n.name == "Paragraph")?.groups).toContain("group #1")
  expect(schema.nodes.find(n => n.name == "Box")).toMatchObject({content: "block: group #1", holds: ["Paragraph"]})
})
