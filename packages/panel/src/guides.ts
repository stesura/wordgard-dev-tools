// Each tab's guide: shown in the panel (the ? in the tab bar) and written into the README's
// "Tabs" section by `npm run readme`. Plain data, `code` in backticks and [links](href) to
// Wordgard's reference, inline: both read it. Wordgard's concepts in its reference's own words.
import type {View} from "./store.ts"

export type Guide = {
  title: string
  /** What the tab shows. */
  summary: string
  tips: string[]
}

const REF = "https://wordgard.net/docs/ref/"

export const GUIDES: Record<View, Guide> = {
  structure: {
    title: "Structure",
    summary: `The document as nested boxes: each node with its type, marks and from–to positions. The selection is marked. [A document is a tree of nodes](${REF}#h-document): [plots](${REF}#doc.Plot) (nodes with content nodes) or [leaves](${REF}#doc.Leaf); [marks](${REF}#doc.Mark) are pieces of information attached to nodes.`,
    tips: [
      `from–to: [positions are offset numbers](${REF}#h-resolved-positions) into the document.`,
      "Hover a box to outline its node in the page; click it for its detail, parameters and JSON.",
      "Right-click a box to scroll it into view, show its type in Schema or its element in DOM, log it, or copy its JSON or path.",
      "Press the pick button in the header, then click in the page, to find a node here.",
    ],
  },
  selection: {
    title: "Selection",
    summary: `The [selection](${REF}#state.GardSelection), its [slice](${REF}#doc.Slice), and its anchor and head [resolved](${REF}#h-resolved-positions).`,
    tips: [
      "The bar at the bottom of the panel always shows the selection, whichever tab is open: its type, anchor, head and marks.",
      "Nodes link to the Structure, types to the Schema.",
      "Hover a card to log or copy it.",
    ],
  },
  state: {
    title: "State",
    summary: `The [editor state](${REF}#state.GardState) as collapsible JSON: [\`GardState.toJSON()\`](${REF}#state.GardState.toJSON), with the named fields that serialise. The state tracks the current document, the selection, the configuration of the editor, and any extra state defined by extensions.`,
    tips: [
      "Right-click a line to highlight its node in the editor, show it in the Structure, log it (live or as JSON), or copy its JSON or path.",
      "The toolbar logs the whole state, live or as JSON.",
      "Download the state as a JSON file, or replace it from one: the file is checked against the schema first, and the replacement can be undone. Fields aren't restored.",
      `Name your [fields](${REF}#state.GardState.Field) with \`wordgardDevtools({fields: {name: field}})\` to see them here.`,
    ],
  },
  view: {
    title: "DOM",
    summary: `The editor's [content DOM](${REF}#editor.Wordgard.contentDOM): the editable DOM element holding the editor content. Each element shows the document node it draws; text shows its position.`,
    tips: [
      "Click an element to outline it in the page. Right-click it to show its node in the Structure, log it, or log or copy its outer HTML.",
      "Elements that draw no node (widgets, decorations) are marked as chrome.",
      "The status line says whether the editor is connected, editable, focused or composing; hover a label for more.",
    ],
  },
  schema: {
    title: "Schema",
    summary: `The [schema](${REF}#h-schema)'s node and mark types and node groups: what each holds, where it can go, its parameter and its spec. A schema is a collection of node and mark types, including exactly one document type, plus an optional set of overrides that modify the relations between those elements.`,
    tips: [
      "Filter by name or tag. Collapse a section from its title.",
      "Type names link between cards. Double-click a card to see its spec as JSON.",
      "Order marks by rank to see how they nest.",
    ],
  },
  fields: {
    title: "Fields",
    summary: `Each [\`GardState.Field\`](${REF}#state.GardState.Field): fields store additional information in an editor state, and keep it in sync with the rest of the state. Its value, and the changes seen to it, each linked to its transaction in the Log.`,
    tips: [
      "Changes are tracked while this tab is shown, or while the Log records.",
      'Unnamed fields show as "field #n": name them with `wordgardDevtools({fields: {name: field}})`.',
      "Expand a change to see the value it set; right-click it to log or copy it.",
    ],
  },
  log: {
    title: "Log",
    summary: `Recorded [transactions](${REF}#state.Transaction). Typically, a user action creates a single transaction, which may contain any number of document changes, may change the selection, or have other effects. For each: what it changed, its selection, [effects](${REF}#state.Transaction.Effect) and [annotations](${REF}#state.Transaction.Annotation), and how long its [dispatch](${REF}#editor.Wordgard.dispatch) and [flush](${REF}#editor.Wordgard.flush) took.`,
    tips: [
      "Press Record, then use the editor. Updates over 16 ms are flagged.",
      `[userEvent](${REF}#state.Transaction.userEvent): a string identifying the user interface event, dot-separated (\`input.type\`, \`select.pointer\`).`,
      `changed: \`doc\`, \`sel\`; \`focus\`, the editor's [focused status changed](${REF}#editor.Wordgard.isFocusChange); \`app\`, [created by a transaction appender](${REF}#state.Transaction.appended).`,
      "Filter by user event, what changed or annotation; sort by any timing column.",
      "Right-click a row to log the transaction or copy it as JSON or text; right-click a part of its detail to log or copy that part.",
      "Untick record select.pointer to leave out selections made with the pointer, and record focus to leave out focus changes.",
    ],
  },
}

/** Guides inside a tab: in the panel only, not the README. */
/** The Selection tab's first part: the selection itself. */
export const SELECTION: Guide = {
  title: "Selection",
  summary: `[\`state.selection\`](${REF}#state.GardState.selection) is a [\`GardSelection\`](${REF}#state.GardSelection). Its [anchor](${REF}#state.GardSelection.anchor) is the side that doesn't move when you extend it; its [head](${REF}#state.GardSelection.head) is moved when it is extended (for example by moving the cursor while holding Shift). \`from\` and \`to\` are the lower and upper boundaries; it is [empty](${REF}#state.GardSelection.empty) when anchor and head are at the same position.`,
  tips: [
    `type: [\`text\`](${REF}#state.GardSelection.Text) selections hold a single arbitrary range in the document, and represent a cursor when empty; [\`node\`](${REF}#state.GardSelection.Node) selections select a single node, for example when clicking on a selectable leaf node. Extensions can define their own.`,
    `It's part of the [state](${REF}#state.GardState), which is immutable: a transaction produces a new selection, or [maps](${REF}#state.GardSelection.map) it through its changes.`,
    `\`side\` in its JSON: [the side the head is associated with](${REF}#state.GardSelection.headSide). -1 means it is after the element before its position, 1 before the element after it. It influences where the cursor is drawn (on a line wrapping boundary or in bidirectional text) and where further motion takes it.`,
    `typing: the [active marks](${REF}#state.GardSelection.Resolved.activeMarks). A cursor's [own](${REF}#state.GardSelection.Text.marks), when it has them (toggling an inline style sticks until something is inserted); otherwise, the marks inserted content would get from spanning marks on the surrounding nodes.`,
    `The slice: [\`selection.toSlice(doc)\`](${REF}#state.GardSelection.toSlice), the part of the document it covers, as clipboard content is. Resolved positions, below: [\`state.sel\`](${REF}#state.GardState.sel), its positions resolved.`,
  ],
}

/** The bar under every tab: the selection at a glance. */
export const SELECTION_BAR: Guide = {
  title: "Selection bar",
  summary: `The selected editor's [selection](${REF}#state.GardSelection), always shown, whichever tab is open. Its [anchor](${REF}#state.GardSelection.anchor) is the side that doesn't move when you extend it; its [head](${REF}#state.GardSelection.head) is moved when it is extended. It is [empty](${REF}#state.GardSelection.empty) when anchor and head are at the same position.`,
  tips: [
    `type: [\`text\`](${REF}#state.GardSelection.Text) (a single range; a cursor when empty) or [\`node\`](${REF}#state.GardSelection.Node) (a single node).`,
    `marks: the [active marks](${REF}#state.GardSelection.Resolved.activeMarks), those that should be applied to content inserted at the selection. (stored): the cursor's [own](${REF}#state.GardSelection.Text.marks), from toggling an inline style.`,
    "Selection opens the Selection tab, with all of it. The buttons show the node holding the head in the Structure, log the selection to the page's console, or copy its JSON.",
  ],
}

export const RESOLVED_POSITIONS: Guide = {
  title: "Resolved positions",
  summary: `[Positions](${REF}#h-resolved-positions) in a Wordgard document are offset numbers. On its own, such a number doesn't tell you much about its context: [\`doc.resolve(pos)\`](${REF}#doc.Plot.Doc.resolve) returns a [\`Pos\`](${REF}#doc.Pos), which describes a position in a node, plus that node's parents.`,
  tips: [
    "Anchor and head are the selection's two ends; an empty selection shows one, the cursor.",
    `[parent](${REF}#doc.Pos.parent): the plot that the position points into. [depth](${REF}#doc.Pos.depth): the amount of plots that wrap it, not counting the document.`,
    `[index](${REF}#doc.Pos.index): the index into its parent's content array. Text nodes don't count as parent plots: inside one, [inText](${REF}#doc.Pos.inText) is the offset into the text node, and index is the text node's.`,
    "Type a number in Resolve to see any position; Escape clears it.",
    "Right-click a card to log the live `Pos` or copy its JSON.",
  ],
}

/** The Schema's Nodes section. */
export const SCHEMA_NODES: Guide = {
  title: "Node types",
  summary: `Each node type in the schema, defined by a [\`Plot.Spec\`](${REF}#doc.Plot.Spec) or a [\`Node.Spec\`](${REF}#doc.Node.Spec). A [plot](${REF}#doc.Plot) delimits part of the document, giving a special meaning to the nodes inside it; a [leaf](${REF}#doc.Leaf) is a node with no content nodes (text, images, line breaks).`,
  tips: [
    `\`block\` or \`inline\`: [whether this node is an inline or a block node](${REF}#doc.Node.Spec.inline). Defaults to block.`,
    `\`textblock\`: [a block node with inline content](${REF}#doc.Plot.isTextblock). \`doc\`: [the document node](${REF}#doc.Plot.Doc).`,
    `[\`defining\`](${REF}#doc.Plot.Spec.defining): preserved (when possible) when its content is duplicated (dragged, pasted, etc) into a new position.`,
    `[\`neutral\`](${REF}#doc.Plot.Spec.neutral): may be completely replaced when its entire content gets replaced. Defaults to \`!defining\`.`,
    `[\`isolating\`](${REF}#doc.Plot.Spec.isolating): disallows some kinds of editing across its borders (such as backspacing or unwrapping).`,
    `[\`canBeEmpty\`](${REF}#doc.Plot.Spec.canBeEmpty): may be empty. Plots with block content, by default, require at least one child.`,
    `[\`preserveWhitespace\`](${REF}#doc.Plot.Spec.preserveWhitespace): whitespace inside it is preserved. [\`row\`](${REF}#doc.Plot.Spec.orientation): its children sit next to each other, not below each other.`,
    `[\`selectable\`](${REF}#doc.Node.Spec.selectable): can be selected by clicking it or moving the selection into it with the keyboard.`,
    `Card lines: [groups](${REF}#doc.Node.Spec.group), content (its spec's query), holds (as the schema resolves it), marks allowed, [param](${REF}#doc.Node.Spec.validate). Press a tag to filter; double-click a card for its JSON.`,
  ],
}

/** The Schema's Marks section. */
export const SCHEMA_MARKS: Guide = {
  title: "Mark types",
  summary: `Each [mark](${REF}#doc.Mark) type, defined by a [\`Mark.Spec\`](${REF}#doc.Mark.Spec): what it adds to the nodes it's on, where it may go, and how it nests with others.`,
  tips: [
    `[\`inclusive\`](${REF}#doc.Mark.Spec.inclusive): active when the cursor is positioned at its end (or at its start when that is also the start of the parent node). Defaults to true.`,
    `[\`spanning\`](${REF}#doc.Mark.Spec.spanning): can span across multiple nodes, rather than referring to an individual node. Only spanning marks can be added to text.`,
    `[\`element\`](${REF}#doc.Mark.Type.isElement): rendered with an element (its [shape](${REF}#doc.Mark.Spec.shape)), not as attributes. Spanning element marks can be drawn as elements containing multiple nodes.`,
    `[\`rank\`](${REF}#doc.Mark.Spec.rank): its position relative to other marks. Lower ranks appear first in mark sets and are rendered around higher ranks. Defaults to 100.`,
    `[\`keepOnSplit\`](${REF}#doc.Mark.Spec.keepOnSplit), [\`keepOnTypeChange\`](${REF}#doc.Mark.Spec.keepOnTypeChange): whether it's kept when its node is split, or changes type.`,
    `goes on: the node types it may go on ([\`target\`](${REF}#doc.Mark.Spec.target), as the schema resolves it). Order by rank to see how marks nest; double-click a card for its JSON.`,
  ],
}

/** The Schema's Node groups section. */
export const SCHEMA_GROUPS: Guide = {
  title: "Node groups",
  summary: `[Groups](${REF}#doc.Node.Group) are used to specify parent-child relationships between nodes, and valid targets for marks. Wordgard's own are the predefined groups, provided as static properties on \`Node.Group\` (such as [\`Node.Group.Content\`](${REF}#doc.Node.Group.Content)), and shown by those names. Groups a schema defines itself, with [\`Node.Group.define\`](${REF}#doc.Node.Group.define), have no name: they're numbered.`,
  tips: [
    "types: the node types in it. content of, target of: where the schema names it.",
    `\`automatic\`: Wordgard puts types in these by what they are: [All](${REF}#doc.Node.Group.All), [Inline](${REF}#doc.Node.Group.Inline), [Block](${REF}#doc.Node.Group.Block), [Leaf](${REF}#doc.Node.Group.Leaf), [Plot](${REF}#doc.Node.Group.Plot), [Textblock](${REF}#doc.Node.Group.Textblock).`,
    `Groups may have a [parent group](${REF}#doc.Node.Group.parent): membership of a group implies membership of its parent groups.`,
    `A group only a [schema override](${REF}#doc.Schema.Override) names isn't seen here.`,
  ],
}

/** The Schema's JSON pane, on a node type: its spec, or what applies. */
export const SPEC_EFFECTIVE_NODE: Guide = {
  title: "Spec and effective",
  summary: `Spec is the node type as defined ([\`Plot.define\`](${REF}#doc.Plot.define), [\`Leaf.define\`](${REF}#doc.Leaf.define)). Effective is what applies in this schema: defaults filled in, overrides applied, and what the schema works out.`,
  tips: [
    "`// default`: the spec doesn't set it, so Wordgard's default applies (`neutral` is `!defining`; a plot with inline content can always be empty).",
    `\`// override\`: a [\`Schema.Override\`](${REF}#doc.Schema.Override) (\`nodeGroup\`, \`plotContent\`) changed it. The Effective button turns amber, and a note says what.`,
    `\`// from the schema\`: worked out from every type: what it may hold ([\`canContain\`](${REF}#doc.Schema.canContain)) and the marks allowed on it ([\`markAllowed\`](${REF}#doc.Schema.markAllowed)).`,
    "Groups Wordgard assigns itself (All, Inline, Block, Leaf, Plot, Textblock) aren't listed.",
  ],
}

/** The Schema's JSON pane, on a mark type. */
export const SPEC_EFFECTIVE_MARK: Guide = {
  title: "Spec and effective",
  summary: `Spec is the mark type as defined ([\`Mark.define\`](${REF}#doc.Mark.define)). Effective is what applies in this schema: defaults filled in, and the node types it may go on.`,
  tips: [
    "`// default`: the spec doesn't set it. `inclusive` defaults to true; `spanning` to true for a mark drawn as an element, false for one set as attributes.",
    `\`targets\`, from the schema: the node types it may go on ([\`markAllowed\`](${REF}#doc.Schema.markAllowed)), after any [\`Schema.Override\`](${REF}#doc.Schema.Override) \`markTarget\`.`,
    `Its rank isn't shown resolved: Wordgard keeps it internal (the spec's, if set, is in Spec).`,
  ],
}

/** The tabs in the panel's order. */
export const TAB_ORDER: View[] = ["structure", "selection", "state", "view", "schema", "fields", "log"]
