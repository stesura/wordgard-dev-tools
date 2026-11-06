import { cn } from "cn";
import { SLOW_MS, type LogEntryDetail, type LogRow } from "@stesura/wordgard-dev-tools";

export const ms = (value: number | null) => (value == null ? "–" : value.toFixed(1));
export const slow = (value: number | null) => value != null && value > SLOW_MS;
/** Slow timings: 4.5:1 or more on the slow rows' tint, in both themes. */
export const slowText = "text-red-700 dark:text-red-300";
export const isSlow = (row: LogRow) => slow(row.dispatchMs) || slow(row.flushMs);

export type Flag = "doc" | "sel" | "focus" | "app";
export const FLAGS: readonly Flag[] = ["doc", "sel", "focus", "app"];
export const FLAG_TIPS: Record<Flag, string> = {
  doc: "Changed the document",
  sel: "Set the selection",
  focus: "The editor gained or lost focus",
  app: "Added by a transaction appender",
};

const flagOf: Record<Flag, (row: LogRow) => boolean> = {
  doc: (row) => row.docChanged,
  sel: (row) => row.selectionSet,
  // Named by the page side from `Wordgard.isFocusChange`.
  focus: (row) => row.annotations.includes("focus"),
  app: (row) => row.appended,
};
export const flags = (row: LogRow) => FLAGS.filter((flag) => flagOf[flag](row));

// Outside EntryView: the React Compiler can't compile this expression inline yet.
export const entryFlags = (entry: LogEntryDetail) =>
  [
    ...flags(entry),
    ...(entry.scrollIntoView ? ["scroll"] : []),
    ...(entry.reconfigured ? ["reconfig"] : []),
  ].join(" ") || "–";

export const flushTitle = (row: LogRow) =>
  row.flush == null
    ? "Not drawn yet"
    : `Flush #${row.flush}` + (row.agentFlush ? ", forced by DevTools' own read" : "");

export const label = (disabled: boolean) =>
  cn("font-semibold", disabled && "text-muted-foreground");
