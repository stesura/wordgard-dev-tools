import { cn } from "cn";
import { SLOW_MS, type LogEntryDetail, type LogRow } from "@stesura/wordgard-dev-tools";

// From a second on, whole milliseconds: "1234.5" overflows the Log's timing columns.
export const ms = (value: number | null) =>
  value == null ? "–" : value.toFixed(value >= 999.95 ? 0 : 1);
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

/** What a row's flush did to the decoration sources, as the Log flags and filters it. */
export type DecorationFlag = "wasted" | "stale";
export const DECORATION_FLAGS: readonly DecorationFlag[] = ["wasted", "stale"];
export const DECORATION_TIPS: Record<DecorationFlag, string> = {
  wasted: "Wasted decoration work: a source rebuilt its set and the editor had nothing to redraw",
  stale: "Decorations not mapped: a source kept its set across a change that moved what it holds",
};

/** The row's flush's flags; null while unknown (not drawn, or not worked out yet). */
export const decorationFlags = (row: LogRow): DecorationFlag[] | null => {
  const summary = row.decorationSummary;
  if (summary == null || summary == "pending") return null;
  return DECORATION_FLAGS.filter((flag) =>
    flag == "wasted" ? summary.wasted > 0 : summary.notMapped > 0
  );
};

/** The rows closing their flush: they carry its badges. */
export const flushEnds = (rows: LogRow[]) => {
  const last = new Map<number, number>();
  for (const row of rows) if (row.flush != null) last.set(row.flush, row.index);
  return new Set(last.values());
};
