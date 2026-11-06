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
  log: guide("log"),
};

/** The Selection tab's cards: the selection, its JSON, its slice. */
export const SELECTION = guide("selection-detail");
export const SELECTION_JSON = guide("selection-json");
export const SELECTION_SLICE = guide("selection-slice");
/** The bar under every tab: the selection at a glance. */
export const SELECTION_BAR = guide("selection-bar");
export const RESOLVED_POSITIONS = guide("resolved-positions");
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
