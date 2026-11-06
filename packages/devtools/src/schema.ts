import type {Mark, Node, Schema} from "wordgard/doc"
import * as wordgardDoc from "wordgard/doc"
import type {SchemaGroup, SchemaInfo, SchemaMarkType, SchemaNodeType, SchemaParam} from "./protocol.ts"
import {toSafe} from "./serialise.ts"

// Loaded with the serialisers, on the first panel request.

const {Group, Role} = wordgardDoc.Node

// Node groups have no names: Wordgard's own are named here, others numbered per schema.
const knownGroups = new Map<Node.Group, string>([
  [Group.All, "All"],
  [Group.Inline, "Inline"],
  [Group.Block, "Block"],
  [Group.Leaf, "Leaf"],
  [Group.Plot, "Plot"],
  [Group.Textblock, "Textblock"],
  [Group.Content, "Content"],
  [Group.TableCell, "TableCell"],
  [Group.ListItem, "ListItem"],
])
// Implied by a type's kind and inline flag: not listed among its groups.
const implied = new Set([Group.All, Group.Inline, Group.Block, Group.Leaf, Group.Plot])

const roles = new Map<Node.Role, string>([
  [Role.Code, "Code"],
  [Role.List, "List"],
  [Role.LineBreak, "LineBreak"],
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

const isQuery = (value: unknown): value is Node.Query =>
  value instanceof Group || Array.isArray(value) || (typeof value == "object" && value != null && ("and" in value || "name" in value))

/** `ƒ name(params)`, from its source: functions don't cross to the panel. */
const fnSummary = (fn: Function) => {
  const source = Function.prototype.toString.call(fn)
  const params =
    /^(?:async\s*)?(?:function\b[^(]*)?\(([^)]*)\)/.exec(source)?.[1] ?? /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/.exec(source)?.[1] ?? "…"
  return `ƒ ${fn.name}(${params.replace(/\s+/g, " ").trim()})`.replace("ƒ (", "ƒ(")
}

const hasToHTML = (value: object): value is {toHTML: () => unknown} => "toHTML" in value && typeof value.toHTML == "function"

/** A spec value as JSON: functions summarised, a structure as its HTML, nesting limited. */
const plain = (value: unknown, depth = 6): unknown => {
  if (typeof value == "function") return fnSummary(value)
  if (typeof value != "object" || value == null) return toSafe(value)
  if (value instanceof Group) return "a group"
  if (hasToHTML(value)) {
    try {
      return String(value.toHTML())
    } catch {
      return "structure"
    }
  }
  if (depth <= 0) return Array.isArray(value) ? `[${value.length} items]` : "{…}"
  if (Array.isArray(value)) return value.map(v => plain(v, depth - 1))
  const proto = Object.getPrototypeOf(value)
  // Class instances (a node type in a rule…): by name when they have one.
  if (proto != Object.prototype && proto != null) {
    return "name" in value && typeof value.name == "string" ? value.name : toSafe(value, 2)
  }
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, plain(v, depth - 1)]))
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

  /** The groups a content or target query names. */
  const groupsIn = (query: Node.Query): Node.Group[] =>
    query instanceof Group ? [query] : isList(query) ? query.flatMap(groupsIn) : "and" in query ? query.and.flatMap(groupsIn) : []

  /** A spec as JSON: what a developer wrote, readable. */
  const specJSON = (name: string, spec: object): unknown => {
    const one = (value: unknown) => (value instanceof Group ? groupName(value) : plain(value))
    const roleName = (role: unknown) => [...roles].find(([r]) => r == role)?.[1] ?? "a role"
    const entries = Object.entries(spec).map(([key, value]): [string, unknown] => [
      key,
      key == "group"
        ? Array.isArray(value) ? value.map(one) : one(value)
        : key == "role"
          ? Array.isArray(value) ? value.map(roleName) : roleName(value)
          : (key == "blockContent" || key == "inlineContent" || key == "target") && isQuery(value)
            ? describe(value)
            : plain(value),
    ])
    return {name, ...Object.fromEntries(entries)}
  }

  const describe = (query: Node.Query): string => {
    if (query instanceof Group) return groupName(query)
    if (isList(query)) return query.map(describe).join(" | ")
    if ("and" in query) return `(${query.and.map(describe).join(" & ")})`
    return query.name
  }

  // Custom groups are numbered in the order the specs mention them, all before any type lists
  // its groups. Groups only an override mentions aren't seen.
  for (const type of schema.nodes) {
    const {group} = type.spec
    for (const g of group instanceof Group ? [group] : (group ?? [])) groupName(g)
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
      spec: specJSON(type.name, type.spec),
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
      spec: specJSON(type.name, type.spec),
    }
  })

  const contentOf = (type: (typeof schema.nodes)[number]) =>
    type.isPlot ? [type.spec.blockContent, type.spec.inlineContent === true ? undefined : type.spec.inlineContent] : []
  // The ones types list first, those every type is in or not by its kind last.
  const groups = [...listed(), ...implied].map(
    (group): SchemaGroup => ({
      name: groupName(group),
      builtIn: knownGroups.has(group),
      implied: implied.has(group),
      members: schema.nodes.filter(type => schema.matchNode(type, group)).map(type => type.name),
      inContentOf: schema.nodes
        .filter(type => contentOf(type).some(query => query != null && groupsIn(query).includes(group)))
        .map(type => type.name),
      inTargetOf: schema.marks.filter(type => type.spec.target && groupsIn(type.spec.target).includes(group)).map(type => type.name),
    }),
  )
    // Wordgard's groups this schema neither fills nor names (TableCell without tables): left out.
    .filter(group => group.members.length || group.inContentOf.length || group.inTargetOf.length)

  return {doc: schema.docTag.name, lineBreak: schema.lineBreak?.name ?? null, nodes, marks, groups}
}
