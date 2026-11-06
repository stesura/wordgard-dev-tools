import { stored, stringSet } from "#stores/stored.ts";
import { isRecord } from "#lib/json.ts";
import type { Kind } from "./schema-cards.tsx";

export const matches = (name: string, query: string) =>
  name.toLowerCase().includes(query.toLowerCase());

/** Every tag the types carry, in first-seen order. */
export const tagsOf = <T>(types: T[], tags: (type: T) => string[]) => [
  ...new Set(types.flatMap(tags)),
];

export const toggled = (set: ReadonlySet<string>, tag: string) => {
  const next = new Set(set);
  if (!next.delete(tag)) next.add(tag);
  return next;
};

const allOpen = { node: true, group: true, mark: true };
export const none: ReadonlySet<string> = new Set();

/** The search, the sections shown (a collapsed one counts as a filter), each section's tags. */
export type SchemaFilters = {
  query: string;
  open: Record<Kind, boolean>;
  nodes: ReadonlySet<string>;
  marks: ReadonlySet<string>;
  groups: ReadonlySet<string>;
};
export const noFilters: SchemaFilters = {
  query: "",
  open: allOpen,
  nodes: none,
  marks: none,
  groups: none,
};

// Saved, shared by every editor: a tag no schema of this one has is left out (`pressedIn`).
export const schemaFilters = stored<SchemaFilters>(
  "wordgard-devtools:schema-filters",
  noFilters,
  (json) => {
    if (!isRecord(json)) return noFilters;
    const open = isRecord(json.open) ? json.open : {};
    return {
      query: typeof json.query == "string" ? json.query : "",
      open: { node: open.node !== false, mark: open.mark !== false, group: open.group !== false },
      nodes: stringSet(json.nodes),
      marks: stringSet(json.marks),
      groups: stringSet(json.groups),
    };
  },
  (filters) => ({
    ...filters,
    nodes: [...filters.nodes],
    marks: [...filters.marks],
    groups: [...filters.groups],
  })
);

/** The pressed tags among those shown. */
export const pressedIn = (pressed: ReadonlySet<string>, tags: string[]): ReadonlySet<string> =>
  new Set(tags.filter((tag) => pressed.has(tag)));
