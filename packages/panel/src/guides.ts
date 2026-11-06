// Each tab's guide: shown in the panel (the ? in the tab bar) and written into the README's
// "Tabs" section by `npm run readme`. Plain data, `code` in backticks: both read it.
import type {View} from "./store.ts"

export type Guide = {
  title: string
  /** What the tab shows. */
  summary: string
  tips: string[]
  /** Wordgard's reference. */
  links: {label: string; href: string}[]
}

const REF = "https://wordgard.net/docs/ref/"

export const GUIDES: Record<View, Guide> = {
  structure: {
    title: "Structure",
    summary: "The document as nested boxes: each node with its type, marks and from–to positions. The selection is marked.",
    tips: [
      "Hover a box to outline its node in the page; click it for its detail, parameters and JSON.",
      "Right-click a box to scroll it into view, show its type in Schema or its element in DOM, log it, or copy its JSON or path.",
      "Press the pick button in the header, then click in the page, to find a node here.",
    ],
    links: [
      {label: "Document", href: `${REF}#h-document`},
      {label: "Pos", href: `${REF}#doc.Pos`},
    ],
  },
  selection: {
    title: "Selection",
    summary:
      "The selection: its type and range, its anchor and head resolved, the slice copying it would take, and any position you type, resolved.",
    tips: [
      "A resolved position (`doc.resolve(pos)`) gives its parent, depth, the nodes either side and the marks there.",
      "Type a position in the box to resolve it. Nodes link to the Structure, types to the Schema.",
      "Each card logs to the page's console or copies its JSON.",
    ],
    links: [
      {label: "GardSelection", href: `${REF}#state.GardSelection`},
      {label: "doc.resolve", href: `${REF}#doc.Plot.Doc.resolve`},
      {label: "Pos", href: `${REF}#doc.Pos`},
    ],
  },
  state: {
    title: "State",
    summary: "The editor's state as collapsible JSON: `GardState.toJSON()`, with the named fields that serialise.",
    tips: [
      "Right-click a line to highlight its node in the editor, show it in the Structure, log it (live or as JSON), or copy its JSON or path.",
      "The toolbar logs the whole state, live or as JSON.",
      "Name your fields with `wordgardDevtools({fields: {name: field}})` to see them here.",
    ],
    links: [{label: "GardState", href: `${REF}#state.GardState`}],
  },
  view: {
    title: "DOM",
    summary: "The editor's content DOM. Each element shows the document node it draws; text shows its position.",
    tips: [
      "Click an element to outline it in the page, and log it from the toolbar.",
      "Elements that draw no node (widgets, decorations) are marked as chrome.",
      "The status line says whether the editor is connected, editable, focused or composing; hover a label for more.",
    ],
    links: [{label: "Wordgard (the editor)", href: `${REF}#editor`}],
  },
  schema: {
    title: "Schema",
    summary: "The schema's node and mark types and node groups: what each holds, where it can go, its parameter and its spec.",
    tips: [
      "Filter by name or tag. Collapse a section from its title.",
      "Type names link between cards. Double-click a card to see its spec as JSON.",
      "Order marks by rank to see how they nest.",
    ],
    links: [
      {label: "Schema", href: `${REF}#doc.Schema`},
      {label: "Schemas (wordgard/doc)", href: `${REF}#h-schema`},
    ],
  },
  fields: {
    title: "Fields",
    summary: "Each `GardState.Field` (plugin state): its value, and the changes seen to it, each linked to its transaction in the Log.",
    tips: [
      "Changes are tracked while this tab is shown, or while the Log records.",
      'Unnamed fields show as "field #n": name them with `wordgardDevtools({fields: {name: field}})`.',
      "Expand a change to see the value it set; right-click it to log or copy it.",
    ],
    links: [{label: "GardState.Field", href: `${REF}#state.GardState.Field`}],
  },
  log: {
    title: "Log",
    summary:
      "Recorded transactions: what each changed, its selection, effects and annotations, and how long its dispatch and flush took.",
    tips: [
      "Press Record, then use the editor. Updates over 16 ms are flagged.",
      "Filter by user event, what changed or annotation; sort by any timing column.",
      "Untick record select.pointer to leave out selections made with the pointer.",
    ],
    links: [
      {label: "Transaction", href: `${REF}#state.Transaction`},
      {label: "userEvent", href: `${REF}#state.Transaction.userEvent`},
      {label: "Annotation", href: `${REF}#state.Transaction.Annotation`},
    ],
  },
}

/** The tabs in the panel's order. */
export const TAB_ORDER: View[] = ["structure", "selection", "state", "view", "schema", "fields", "log"]
