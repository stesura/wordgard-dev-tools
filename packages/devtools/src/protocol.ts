// The wire protocol between the panel and the page agent. Everything here is
// structured-cloneable: it crosses `postMessage` in the extension.

export const PROTOCOL = 1;
export const SOURCE = "wordgard-devtools";

/** Child indices from the document down to a node. `[]` is the document. */
export type Path = readonly number[];

export type TreeNode = {
  path: Path;
  name: string;
  /** Position before the node (0 for the document). */
  from: number;
  /** Position after the node. */
  to: number;
  childCount: number;
  marks: { name: string; preview: string | null }[];
  paramPreview: string | null;
  /** A text leaf's text, or a textblock's, truncated. */
  textPreview: string | null;
};

/** The whole document, nested: for the Structure tab. */
export type StructureNode = TreeNode & {
  children: StructureNode[];
  /** A text leaf's full text (its preview is truncated): for searching. */
  text?: string;
};

export type NodeDetail = TreeNode & {
  param: unknown;
  markValues: { name: string; value: unknown }[];
  /** A text leaf's full text. */
  text: string | null;
  /** `node.toJSON()`, or null for a node too large to send (the document, usually). */
  json: unknown;
};

/** One of a node's values, as the node pane lists them: logged live (its type, param, mark). */
export type NodePart = "type" | "path" | "range" | "param" | "text" | { mark: number };

export type SelectionInfo = {
  anchor: number;
  head: number;
  from: number;
  to: number;
  empty: boolean;
  /** `GardSelection.toJSON`, which names the selection type. */
  json: unknown;
  /** Innermost node holding the head: its plot, or its text leaf. */
  headPath: Path;
  anchorPath: Path;
  /** A node selection's node; null for other selections. */
  nodePath: Path | null;
  /** What typed text gets: `state.sel.activeMarks`. */
  activeMarks: MarkPreview[];
  /** They're the cursor's own (`GardSelection.Text.marks`), not those around it. */
  storedMarks: boolean;
};

export type MarkPreview = { name: string; preview: string | null };

/** `doc.resolve(pos)`, its nodes as tree nodes. */
export type ResolvedPos = {
  pos: number;
  /** Plots around it, not counting the document. */
  depth: number;
  /** The plot it points into. */
  parent: TreeNode;
  /** Into the parent's content; the text node's when `inText`. */
  index: number;
  /** The offset into the text node it falls in, or 0. */
  inText: number;
  /** The whole nodes either side: in a text node, that node both times. */
  nodeBefore: TreeNode | null;
  nodeAfter: TreeNode | null;
  /** In a text node: its text before and after the position, truncated. */
  textBefore: string | null;
  textAfter: string | null;
  textblock: TreeNode | null;
  /** At the very start or end of its parent's content (never inside a text node). */
  atStart: boolean;
  atEnd: boolean;
  /** Inline marks active at the position. */
  marks: MarkPreview[];
};

/** A slice's token: a plot opened or closed, or a whole node. */
export type SliceToken =
  | { kind: "open"; name: string }
  | { kind: "close" }
  | { kind: "node"; name: string; text: string | null; marks: string[] };

/** `selection.toSlice(doc)`: what copying the selection takes. */
export type SliceInfo = {
  length: number;
  /** `textContent()`, truncated. */
  text: string;
  /** The first tokens, up to a limit. */
  tokens: SliceToken[];
  /** Tokens past the limit. */
  more: number;
  /** The plots around it, innermost first. */
  context: string[];
  /** The tokens' JSON, or null for a slice too large to send. */
  json: unknown;
};

/** The selection, resolved: for the Selection tab. */
export type SelectionDetail = {
  anchor: ResolvedPos;
  head: ResolvedPos;
  slice: SliceInfo;
  /** One, or several for a multi-range selection. */
  ranges: { from: number; to: number }[];
  /** What content typed here gets: a cursor's stored marks, or the marks around it. */
  activeMarks: MarkPreview[];
};

export type EditorInfo = {
  id: number;
  name: string;
  attached: boolean;
  recording: boolean;
  /** The frame it lives in, when not the top one. Set by the extension's transport. */
  frame?: string;
};

export type AgentInfo = { version: string; protocol: number };

/** An update over this many ms (a frame's budget) is flagged slow. */
export const SLOW_MS = 16;

/** A transaction in the log, shallow. */
export type LogRow = {
  /** Counts up from the first transaction recorded on this editor; never reused, `clear` included. */
  index: number;
  /** `Transaction.time`. */
  time: number;
  userEvent: string | null;
  /** Added by a transaction appender. */
  appended: boolean;
  docChanged: boolean;
  selectionSet: boolean;
  effects: number;
  /** Its annotations' types, the time stamp included: Wordgard's own by name, others "annotation #n". */
  annotations: string[];
  /** The `dispatch` call that produced it, nested dispatches included. Null when untimed. */
  dispatchMs: number | null;
  /** The flush that drew it, shared with the rest of that flush's transactions. Null until drawn. */
  flushMs: number | null;
  /** Which flush: the rows sharing it share this number. */
  flush: number | null;
  /** That flush was forced by the panel's own reads (an outline, a pick), not the app. */
  agentFlush: boolean;
};

export type LogSlice = {
  /** The oldest index still held. */
  start: number;
  /** The next index to be recorded. */
  end: number;
  /** Rows from this index on may still change (their flush hasn't come). */
  pending: number;
  recording: boolean;
  /** The ring buffer's size. */
  size: number;
  rows: LogRow[];
};

/** Values serialised with `toSafe`, named when the type is one of Wordgard's own. */
export type NamedValue = { type: string; value: unknown };

export type ChangedRange = {
  /** In the document before. */
  fromA: number;
  toA: number;
  /** In the document after. */
  fromB: number;
  toB: number;
  /** The tokens' JSON. */
  before: unknown[];
  after: unknown[];
  beforeText: string;
  afterText: string;
};

/** A transaction in the log, or one of its parts, to log live. */
export type EntryPart = "transaction" | "changes" | "selection" | "effects" | "annotations";

export type LogEntryDetail = LogRow & {
  /** `changes.toJSON()`. */
  changes: unknown;
  ranges: ChangedRange[];
  /** Selections' JSON: the one the transaction set (null when mapped), before and after. */
  selection: { set: unknown; before: unknown; after: unknown };
  effectValues: NamedValue[];
  annotationValues: NamedValue[];
  scrollIntoView: boolean;
  reconfigured: boolean;
};

export type SchemaParam = {
  /** The spec's `defaultParam` (undefined when none). */
  default: unknown;
  /** The spec's `validate`: its string form, "function", or null. */
  validate: string | null;
};

/**
 * What applies to a type, as Wordgard resolved it (public API only: overrides themselves are
 * internal). `notes` says, per key, why a value isn't the spec's: "default" (the spec doesn't set
 * it), "override" (it differs from the spec's), "schema" (worked out from the whole schema).
 */
export type EffectiveSpec = {
  value: Record<string, unknown>;
  notes: Record<string, "default" | "override" | "schema">;
};

export type SchemaNodeType = {
  name: string;
  kind: "plot" | "leaf";
  inline: boolean;
  /** Groups it matches (Wordgard's own by name, others numbered), besides the ones its kind implies. */
  groups: string[];
  roles: string[];
  /** As the spec says it (`block: …`, `inline: …`; an override may change it, `holds` is what applies). Null for leaves. */
  content: string | null;
  /** The node types it may hold (`schema.canContain`). */
  holds: string[];
  /** The mark types allowed on it. */
  marks: string[];
  param: SchemaParam;
  flags: string[];
  /** Its DOM shape, briefly: `<p>`, a structure's HTML, … */
  shape: string;
  /** Its spec as JSON: groups, roles and queries by name, functions as `ƒ name(params)`. */
  spec: unknown;
  effective: EffectiveSpec;
};

export type SchemaMarkType = {
  name: string;
  /** As the spec says it (an override may change it, `targets` is what applies), or null when it has none. */
  target: string | null;
  /** The node types it may go on (`schema.markAllowed`). */
  targets: string[];
  rank: number | null;
  param: SchemaParam;
  flags: string[];
  shape: string;
  /** Its spec as JSON, as a node type's. */
  spec: unknown;
  effective: EffectiveSpec;
};

/** A node group: the node types in it, and where the schema names it. */
export type SchemaGroup = {
  /** Wordgard's own by name, a schema's numbered (groups have no names). */
  name: string;
  /** One of Wordgard's own groups, not the schema's. */
  builtIn: boolean;
  /** Every type is in it or not by its kind or inline flag (Block, Inline, Leaf, Plot, All): types don't list it. */
  implied: boolean;
  members: string[];
  /** Node types whose content spec names it. */
  inContentOf: string[];
  /** Mark types whose target spec names it. */
  inTargetOf: string[];
};

export type SchemaInfo = {
  /** The document type's name. */
  doc: string;
  lineBreak: string | null;
  nodes: SchemaNodeType[];
  marks: SchemaMarkType[];
  groups: SchemaGroup[];
};

export type FieldChange = {
  /** Identifies the change in its field's history, for `fieldChange` and `logField`. */
  seq: number;
  /** The transaction's `Transaction.time`. */
  time: number;
  /** Its index in the transaction log, when it is there. */
  log: number | null;
  /** The value it set, truncated. */
  preview: string | null;
};

export type FieldInfo = {
  /** Its place among the state's fields (in extension order). */
  index: number;
  /** From `wordgardDevtools({fields})`, else "field #n". */
  name: string;
  named: boolean;
  preview: string | null;
  /** Changes seen while watched or recorded (the last ones kept). */
  changes: number;
  last: FieldChange | null;
};

export type FieldsInfo = {
  /** Changes are being tracked: the Fields tab is shown or the log records. */
  tracking: boolean;
  fields: FieldInfo[];
};

export type FieldDetail = FieldInfo & {
  value: unknown;
  /** Oldest first. */
  history: FieldChange[];
};

/** A DOM node of the editor's content, mapped back to the document where it draws a node. */
export type ViewNode = {
  kind: "element" | "text";
  /** Elements: the tag, lower-case. */
  tag: string | null;
  /** Elements: the attributes, values truncated. */
  attrs: [string, string][];
  /** Text: its text, truncated. */
  text: string | null;
  /** The document node this element draws. */
  node: { name: string; path: Path; from: number; to: number } | null;
  /** Text: the position before it. */
  pos: number | null;
  /** Uneditable and drawing no node: a widget, decoration or React chrome. */
  chrome: boolean;
  children: ViewNode[];
};

export type ViewInfo = {
  status: {
    connected: boolean;
    editable: boolean;
    focusable: boolean;
    focused: boolean;
    composing: boolean;
    compositionStarted: boolean | null;
    root: "document" | "shadow root";
  };
  /** The content element (`contentDOM`). */
  dom: ViewNode;
};

type Empty = Record<never, never>;

export type Requests = {
  listEditors: Empty;
  /** Attach the panel to an editor, or detach it with `null`. */
  select: { id: number | null };
  /** `GardState.toJSON`: the document and the selection, plus the named fields that serialise. */
  stateJSON: { id: number };
  /**
   * Replaces the editor's document and selection with a state's JSON (`stateJSON`'s), after
   * checking it against the schema; one transaction, so it can be undone. Fields aren't restored.
   */
  replaceState: { id: number; json: unknown };
  node: { id: number; path: Path };
  structure: { id: number };
  /** The state's schema: node and mark types. */
  schema: { id: number };
  /** The editor's view: its status and its content's DOM. */
  view: { id: number };
  /** Logs the editor (the `Wordgard` instance) in the page's console. */
  logEditor: { id: number };
  /** Logs the DOM element drawing a node, or its nearest ancestor's, in the page's console. */
  logNodeDOM: { id: number; path: Path };
  /** Outlines (in the page) or logs (in the page's console: the node, or its outer HTML) a DOM node of `view`, by its child indices. */
  viewElement: { id: number; path: readonly number[]; action: "outline" | "log" | "logHTML" };
  /** A DOM node of `view`'s outer HTML (a text node's text). */
  viewHTML: { id: number; path: readonly number[] };
  selection: { id: number };
  selectionDetail: { id: number };
  /** Resolves any position in the document. */
  resolve: { id: number; pos: number };
  /** Logs `doc.resolve(pos)` in the page's console. */
  logPos: { id: number; pos: number };
  /** Logs the selection's slice in the page's console. */
  logSlice: { id: number };
  fields: { id: number };
  field: { id: number; index: number };
  /** The value a change in a field's history set, as `field`'s `value` is. */
  fieldChange: { id: number; index: number; seq: number };
  /**
   * Logs a field's live value in the page's console; with `seq`, the value that change set; with
   * `history`, every change in its history, newest first.
   */
  logField: { id: number; index: number; seq?: number; history?: boolean };
  /** Forgets the changes seen to a field, or to every field without `index`. */
  clearFieldHistory: { id: number; index?: number };
  /** Logs a node or mark type in the page's console, or with `json` its spec as the Schema tab shows
   * it; a group, its data. */
  logType: { id: number; kind: "node" | "mark" | "group"; name: string; json?: boolean };
  /** Tracks the fields' changes while the panel shows them (the log's recording tracks them too). */
  watchFields: { id: number; on: boolean };
  /** Starts or pauses the log; `size` sets the ring buffer's (500 by default). */
  record: {
    id: number;
    on: boolean;
    size?: number;
    /** Records `select.pointer` transactions (a pointer selecting); true by default. */
    selectPointer?: boolean;
    /** Records focus changes (`Wordgard.isFocusChange`: the editor gaining or losing focus); true by default. */
    focusChanges?: boolean;
  };
  clear: { id: number };
  /** Rows with `from <= index < to`, of those still held. */
  log: { id: number; from: number; to: number };
  entry: { id: number; index: number };
  /** Logs a transaction in the log (by default), or one of its parts, live in the page's console. */
  logEntry: { id: number; index: number; part?: EntryPart };
  /** Outlines the node in the page; `path: null` hides the outline (any `id`). */
  highlight: { id: number; path: Path | null };
  pick: { on: boolean };
  /** Scrolls the node into view in the page (its editor and the page around). */
  scrollIntoView: { id: number; path: Path };
  /** Logs the node itself in the page's console, its `toJSON()` with `json`, or with `part` one of its values. */
  logNode: { id: number; path: Path; json?: boolean; part?: NodePart };
  /** Logs a value of `stateJSON` in the page's console, by its keys: the live state, selection or
   * named field where it is one of those (unless `json`), its JSON otherwise. */
  logState: { id: number; keys: readonly string[]; json?: boolean };
  setConsole: { id: number; index?: number };
  repro: { id: number };
};

export type Results = {
  listEditors: {
    /** Null when no frame has a usable agent. */
    agent: AgentInfo | null;
    editors: EditorInfo[];
    /** Problems with some frames (a protocol mismatch), for the panel to show. */
    notices?: string[];
  };
  select: null;
  stateJSON: unknown;
  /** `exact`: the editor's document came out as the JSON's (an appender may change it). */
  replaceState: { exact: boolean };
  node: NodeDetail;
  structure: StructureNode;
  schema: SchemaInfo;
  view: ViewInfo;
  viewElement: null;
  viewHTML: string;
  selection: SelectionInfo;
  selectionDetail: SelectionDetail;
  resolve: ResolvedPos;
  logPos: null;
  logSlice: null;
  logEditor: null;
  logNodeDOM: null;
  fields: FieldsInfo;
  field: FieldDetail;
  fieldChange: unknown;
  logField: null;
  clearFieldHistory: null;
  logType: null;
  watchFields: null;
  record: null;
  clear: null;
  log: LogSlice;
  entry: LogEntryDetail;
  logEntry: null;
  highlight: null;
  pick: null;
  scrollIntoView: null;
  logNode: null;
  logState: null;
  setConsole: null;
  repro: string;
};

export type RequestType = keyof Requests;

export type Request<K extends RequestType = RequestType> = {
  [P in K]: { type: P } & Requests[P];
}[K];

export type Reply<K extends RequestType = RequestType> =
  { ok: true; value: Results[K] } | { ok: false; error: string };

export type Push =
  | { type: "editorsChanged" }
  | {
      type: "stateChanged";
      id: number;
      docChanged: boolean;
      selectionSet: boolean;
      reconfigured: boolean;
    }
  | { type: "picked"; id: number; path: Path }
  /** Picking ended without a pick (Escape in the page). */
  | { type: "pickCancelled" }
  /** Rows were appended, timed or cleared (coalesced per task), for attached editors. */
  | { type: "logChanged"; id: number; end: number };

export type Message =
  | { source: typeof SOURCE; v: number; kind: "request"; id: number; request: Request }
  | { source: typeof SOURCE; v: number; kind: "reply"; id: number; reply: Reply }
  | { source: typeof SOURCE; v: number; kind: "push"; push: Push }
  /** From the agent, when created and when pinged: lets a bridge find it. */
  | { source: typeof SOURCE; v: number; kind: "announce"; agent: AgentInfo }
  | { source: typeof SOURCE; v: number; kind: "ping" }
  /** The extension's panel went away: stop pushing over postMessage, detach editors. */
  | { source: typeof SOURCE; v: number; kind: "detach" };

export const mismatch = (agent: number, panel: number) =>
  `Page agent speaks protocol ${agent}, panel expects ${panel}`;

/** Keys as a JS accessor (`.doc.content[0]`): the State tab's paths, copied or logged. */
export const accessor = (keys: readonly string[]) =>
  keys
    .map((key) =>
      /^\d+$/.test(key)
        ? `[${key}]`
        : /^[A-Za-z_$][\w$]*$/.test(key)
          ? `.${key}`
          : `[${JSON.stringify(key)}]`
    )
    .join("");
