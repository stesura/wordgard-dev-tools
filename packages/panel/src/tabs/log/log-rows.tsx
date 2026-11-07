import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon } from "#icons";
import type { DecorationSummary, LogRow } from "@stesura/wordgard-dev-tools";
import { Tag } from "#components/ui/badge";
import { Tip } from "#components/tip";
import { flags, flushTitle, isSlow, ms, slow, slowText } from "./log-format.ts";
import { clock } from "#lib/time.ts";

/** A timing. A slow one is red, and (not by colour alone, WCAG 1.4.1) bold, signed and read as slow. */
export const Timing = ({ value, unit = "" }: { value: number | null; unit?: string }) =>
  slow(value) ? (
    <span className={cn("inline-flex items-center gap-0.5 align-top font-semibold", slowText)}>
      <ExclamationTriangleIcon className="size-3 shrink-0" />
      {ms(value)}
      {unit}
      <span className="sr-only">, slow</span>
    </span>
  ) : (
    `${ms(value)}${unit}`
  );

/** The flush cell's name, in place of its content. */
const flushLabel = (row: LogRow) =>
  row.flushMs == null
    ? flushTitle(row)
    : `${ms(row.flushMs)} ms${slow(row.flushMs) ? ", slow" : ""}, ${flushTitle(row)}`;

// 24: a row is a 24px target (WCAG 2.5.8).
export const ROW = 24;
export const COLUMNS =
  "grid grid-cols-[3rem_6.5rem_minmax(5rem,1fr)_4.5rem_2rem_2rem_3.5rem_3.5rem] gap-x-2";

/** A flush's decoration flags, on its last row; read aloud by name ("↻ 0" says little). */
const DecorationBadges = ({ summary }: { summary: DecorationSummary }) => {
  const plural = (n: number) => `${n} decoration source${n == 1 ? "" : "s"}`;
  const amber = "shrink-0 bg-amber-500/20 text-amber-800 dark:text-amber-300";
  return (
    <>
      {summary.wasted > 0 && (
        <Tag data-decorations="wasted" className={amber}>
          <span aria-hidden="true">↻ 0{summary.wasted > 1 && ` ×${summary.wasted}`}</span>
          <span className="sr-only">{plural(summary.wasted)} rebuilt for nothing</span>
        </Tag>
      )}
      {summary.notMapped > 0 && (
        <Tag data-decorations="stale" className={amber}>
          <span aria-hidden="true">stale</span>
          <span className="sr-only">{plural(summary.notMapped)} not mapped</span>
        </Tag>
      )}
    </>
  );
};

export const Row = ({
  row,
  start,
  selected,
  decorations = null,
}: {
  row: LogRow;
  start: number;
  selected: boolean;
  /** Its flush's decoration summary, on the flush's last row while the Log asks for them. */
  decorations?: DecorationSummary | null;
}) => (
  <div
    id={`log-row-${row.index}`}
    role="option"
    aria-selected={selected}
    data-index={row.index}
    className={cn(
      COLUMNS,
      "absolute inset-x-0 top-0 cursor-default items-center px-2 font-mono text-xs whitespace-nowrap",
      // A bar marks it: bg-accent alone is 1.1:1.
      selected && "bg-accent shadow-[inset_3px_0_0_var(--color-ring)]",
      isSlow(row) && "bg-destructive/10"
    )}
    style={{ height: ROW, transform: `translateY(${start}px)` }}
  >
    <span className="text-muted-foreground">{row.index}</span>
    <span className="text-muted-foreground">{clock(row.time)}</span>
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">
        {row.userEvent ?? <span className="text-muted-foreground">–</span>}
      </span>
      {decorations && <DecorationBadges summary={decorations} />}
    </span>
    <span className="flex gap-1">
      {flags(row).map((flag) => (
        <Tag key={flag}>{flag}</Tag>
      ))}
    </span>
    {/* No tooltip per cell (a busy log re-renders its rows often): the column headers have them. */}
    <span>{row.effects || ""}</span>
    <span>{row.annotations.length || ""}</span>
    <span className="text-right">
      <Timing value={row.dispatchMs} />
    </span>
    <span data-flush={row.flush ?? undefined} aria-label={flushLabel(row)} className="text-right">
      <Timing value={row.flushMs} />
      {row.agentFlush && "*"}
    </span>
  </div>
);

type SortKey = "index" | "time" | "annotations" | "dispatch" | "flush";
export type Sort = { key: SortKey; descending: boolean };

const sortValue: Record<SortKey, (row: LogRow) => number | null> = {
  index: (row) => row.index,
  time: (row) => row.time,
  annotations: (row) => row.annotations.length,
  dispatch: (row) => row.dispatchMs,
  flush: (row) => row.flushMs,
};

/** Untimed rows last either way; ties in log order. */
export const sorted = (rows: LogRow[], { key, descending }: Sort) =>
  key == "index" && !descending
    ? rows
    : rows.toSorted((a, b) => {
        const x = sortValue[key](a);
        const y = sortValue[key](b);
        if (x == null || y == null) return x == y ? a.index - b.index : x == null ? 1 : -1;
        return (descending ? y - x : x - y) || a.index - b.index;
      });

/** A column heading that sorts the rows: ascending first, then descending. */
export const SortHeading = ({
  sortKey,
  label,
  tip,
  sort,
  onSort,
  right,
}: {
  sortKey: SortKey;
  label: string;
  tip: string;
  sort: Sort;
  onSort: (sort: Sort) => void;
  right?: boolean;
}) => {
  const active = sort.key == sortKey;
  return (
    <Tip label={tip}>
      <button
        type="button"
        aria-label={`Sort by ${tip.toLowerCase()}`}
        aria-pressed={active}
        data-sort={active ? (sort.descending ? "descending" : "ascending") : undefined}
        onClick={() => onSort({ key: sortKey, descending: active && !sort.descending })}
        className={cn(
          "flex cursor-pointer items-center gap-0.5 hover:text-foreground [&_svg]:size-3",
          right && "justify-end",
          active && "text-foreground"
        )}
      >
        {label}
        {active && (sort.descending ? <ChevronDownIcon /> : <ChevronUpIcon />)}
      </button>
    </Tip>
  );
};
