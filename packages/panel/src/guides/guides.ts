// The guides, written in markdown beside this file (see parse.ts for the format). Each tab's is
// shown in the panel (the ? in the tab bar) and written into the README's "Tabs" section by
// `npm run readme`; the others are shown in the panel only. Wordgard's concepts in its reference's
// own words.
import type { Tab } from "../tabs/tabs.ts";
import { parseGuide, type Guide } from "./parse.ts";

export type { Guide };

const files = import.meta.glob<string>("./*.md", { query: "?raw", import: "default", eager: true });

const guide = (name: string) => {
  const text = files[`./${name}.md`];
  if (text == null) throw new Error(`No guide ${name}.md`);
  return parseGuide(text, `${name}.md`);
};

export const GUIDES: Record<Tab, Guide> = {
  structure: guide("structure"),
  selection: guide("selection"),
  state: guide("state"),
  dom: guide("dom"),
  schema: guide("schema"),
  fields: guide("fields"),
  extensions: guide("extensions"),
  log: guide("log"),
};

/** The Selection tab's cards: the selection, its JSON, its slice. */
export const SELECTION = guide("selection-detail");
export const SELECTION_JSON = guide("selection-json");
export const SELECTION_SLICE = guide("selection-slice");
/** The bar under every tab: the selection at a glance. */
export const SELECTION_BAR = guide("selection-bar");
/** The same bar's Editor: the view's status. */
export const EDITOR_BAR = guide("editor-bar");
export const RESOLVED_POSITIONS = guide("resolved-positions");
/** The Log's filter bar. */
export const LOG_FILTERS = guide("log-filters");
/** The Log's decoration checks: the toolbar's toggle and an entry's section. */
export const LOG_DECORATIONS = guide("log-decorations");
/** The Schema's Nodes section. */
export const SCHEMA_NODES = guide("schema-nodes");
/** The Schema's Marks section. */
export const SCHEMA_MARKS = guide("schema-marks");
/** The Schema's Node groups section. */
export const SCHEMA_GROUPS = guide("schema-groups");
/** The Schema's JSON pane, on a node type: its spec, or what applies. */
export const SPEC_EFFECTIVE_NODE = guide("spec-effective-node");
/** The Schema's JSON pane, on a mark type. */
export const SPEC_EFFECTIVE_MARK = guide("spec-effective-mark");
/** The Extensions tab's tree, and its details pane. */
export const EXTENSIONS_TREE = guide("extensions-tree");
export const EXTENSION_DETAIL = guide("extension-detail");
/** The Extensions tab's Key bindings pane: its columns, and using the table. */
export const KEY_BINDINGS = guide("key-bindings");
