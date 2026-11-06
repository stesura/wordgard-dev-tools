import { asJSON, persistent } from "#stores/persistent.ts";
import { isRecord, stringSet } from "#lib/json.ts";
import type { Kind } from "./schema-cards.tsx";

/** Every tag the types carry, in first-seen order. */
export const tagsOf = <T>(types: T[], tags: (type: T) => string[]) => [
  ...new Set(types.flatMap(tags)),
];

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

// Saved: created by the Schema as it mounts, so every editor's Schema reads the same. A tag no
// schema of this one has is left out (`pressedIn`).
export const createSchemaFilters = () =>
  persistent(
    "wordgard-devtools:schema-filters",
    noFilters,
    asJSON(
      (json): SchemaFilters => {
        if (!isRecord(json)) return noFilters;
        const open = isRecord(json.open) ? json.open : {};
        return {
          query: typeof json.query == "string" ? json.query : "",
          open: {
            node: open.node !== false,
            mark: open.mark !== false,
            group: open.group !== false,
          },
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
    )
  );

/** The pressed tags among those shown. */
export const pressedIn = (pressed: ReadonlySet<string>, tags: string[]): ReadonlySet<string> =>
  new Set(tags.filter((tag) => pressed.has(tag)));
