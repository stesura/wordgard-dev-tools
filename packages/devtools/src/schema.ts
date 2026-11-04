import {Node, type Mark, type Schema} from "wordgard/doc"
import type {SchemaInfo, SchemaMarkType, SchemaNodeType, SchemaParam} from "./protocol.ts"
import {toSafe} from "./serialise.ts"

// Loaded with the serialisers, on the first panel request.

// Node groups have no names: Wordgard's own are named here, others numbered per schema.
const knownGroups = new Map<Node.Group, string>([
  [Node.Group.All, "All"],
  [Node.Group.Inline, "Inline"],
  [Node.Group.Block, "Block"],
  [Node.Group.Leaf, "Leaf"],
  [Node.Group.Plot, "Plot"],
  [Node.Group.Textblock, "Textblock"],
  [Node.Group.Content, "Content"],
  [Node.Group.TableCell, "TableCell"],
  [Node.Group.ListItem, "ListItem"],
])
// Implied by a type's kind and inline flag: not listed among its groups.
const implied = new Set([Node.Group.All, Node.Group.Inline, Node.Group.Block, Node.Group.Leaf, Node.Group.Plot])

const roles = new Map<Node.Role, string>([
  [Node.Role.Code, "Code"],
  [Node.Role.List, "List"],
  [Node.Role.LineBreak, "LineBreak"],
])

type Spec = {
  defaultParam?: unknown
  validate?: string | ((param: never) => void)
  shape: object
}

// Array.isArray doesn't narrow a readonly array out of a union.
const isList = (query: Node.Query): query is readonly Node.Query[] => Array.isArray(query)

const param = (spec: Spec): SchemaParam => ({
  default: spec.defaultParam === undefined ? undefined : toSafe(spec.defaultParam),
  validate: typeof spec.validate == "string" ? spec.validate : spec.validate ? "function" : null,
})

const shape = (spec: Spec): string => {
  const s = spec.shape
  if ("element" in s && typeof s.element == "string") {
    // Text and the document draw no element of their own.
    if (!s.element) return "none"
    return `<${s.element}>` + ("selector" in s && s.selector ? ` ${s.selector}` : "")
  }
  if ("attribute" in s && typeof s.attribute == "string") return `[${s.attribute}]`
  if ("attributes" in s) return typeof s.attributes == "function" ? "attributes(param)" : `attributes`
  if ("structure" in s) {
    const {structure} = s
    if (typeof structure == "function") return "structure(param)"
    if (typeof structure == "object" && structure != null && "toHTML" in structure && typeof structure.toHTML == "function") {
      return String(structure.toHTML())
    }
    return "structure"
  }
  return "?"
}

export const schemaInfo = (schema: Schema): SchemaInfo => {
  const custom = new Map<Node.Group, string>()
  const groupName = (group: Node.Group) => {
    const known = knownGroups.get(group) ?? custom.get(group)
    if (known) return known
    const name = `group #${custom.size + 1}`
    custom.set(group, name)
    return name
  }

  const describe = (query: Node.Query): string => {
    if (query instanceof Node.Group) return groupName(query)
    if (isList(query)) return query.map(describe).join(" | ")
    if ("and" in query) return `(${query.and.map(describe).join(" & ")})`
    return query.name
  }

  // Custom groups are numbered in the order the specs mention them, all before any type lists
  // its groups. Groups only an override mentions aren't seen.
  for (const type of schema.nodes) {
    const {group} = type.spec
    for (const g of group instanceof Node.Group ? [group] : (group ?? [])) groupName(g)
    if (type.isPlot && type.spec.blockContent) describe(type.spec.blockContent)
    if (type.isPlot && type.spec.inlineContent && type.spec.inlineContent !== true) describe(type.spec.inlineContent)
  }
  for (const type of schema.marks) if (type.spec.target) describe(type.spec.target)
  const listed = () => [...knownGroups.keys(), ...custom.keys()].filter(group => !implied.has(group))

  const nodes = schema.nodes.map((type): SchemaNodeType => {
    const flags: string[] = []
    if (type.isPlot) {
      if (type.isDoc) flags.push("doc")
      if (type.isTextblock) flags.push("textblock")
      for (const key of ["isolating", "defining", "neutral", "preserveWhitespace", "canBeEmpty"] satisfies (keyof typeof type)[]) {
        if (type[key]) flags.push(key)
      }
      // Textblocks run in rows anyway.
      if (type.orientation == "row" && !type.isTextblock) flags.push("row")
    }
    if (type.isSelectable) flags.push("selectable")
    const content =
      type.isPlot && type.spec.blockContent
        ? `block: ${describe(type.spec.blockContent)}`
        : type.isPlot && type.spec.inlineContent
          ? `inline: ${type.spec.inlineContent === true ? "any" : describe(type.spec.inlineContent)}`
          : null
    return {
      name: type.name,
      kind: type.isPlot ? "plot" : "leaf",
      inline: type.isInline,
      groups: listed().filter(group => schema.matchNode(type, group)).map(groupName),
      roles: [...roles].filter(([role]) => type.hasRole(role)).map(([, name]) => name),
      content,
      holds: type.isPlot ? schema.nodes.filter(child => schema.canContain(type, child)).map(child => child.name) : [],
      marks: schema.marks.filter(mark => schema.markAllowed(mark, type)).map(mark => mark.name),
      param: param(type.spec),
      flags,
      shape: shape(type.spec),
    }
  })

  const marks = schema.marks.map((type: Mark.Type): SchemaMarkType => {
    const flags: string[] = []
    if (type.inclusive) flags.push("inclusive")
    if (type.spanning) flags.push("spanning")
    if (type.isElement) flags.push("element")
    if (type.spec.keepOnSplit) flags.push("keepOnSplit")
    if (type.spec.keepOnTypeChange) flags.push("keepOnTypeChange")
    return {
      name: type.name,
      target: type.spec.target ? describe(type.spec.target) : null,
      targets: schema.nodes.filter(node => schema.markAllowed(type, node)).map(node => node.name),
      rank: type.spec.rank ?? null,
      param: param(type.spec),
      flags,
      shape: shape(type.spec),
    }
  })

  return {doc: schema.docTag.name, lineBreak: schema.lineBreak?.name ?? null, nodes, marks}
}
