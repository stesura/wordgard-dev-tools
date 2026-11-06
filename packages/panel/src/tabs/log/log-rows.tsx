import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "#icons";
import type { LogRow } from "@stesura/wordgard-dev-tools";
import { Tag } from "#components/ui/badge";
import { Tip } from "#components/tip";
import { flags, flushTitle, isSlow, ms, slow, slowText } from "./log-format.ts";
import { clock } from "#lib/time.ts";

export const ROW = 20;
export const COLUMNS =
  "grid grid-cols-[3rem_6.5rem_minmax(5rem,1fr)_4.5rem_2rem_2rem_3.5rem_3.5rem] gap-x-2";

export const Row = ({
  row,
  start,
  selected,
}: {
  row: LogRow;
  start: number;
  selected: boolean;
}) => (
  <div
    id={`log-row-${row.index}`}
    role="option"
    aria-selected={selected}
    data-index={row.index}
    className={cn(
      COLUMNS,
      "absolute inset-x-0 top-0 cursor-default items-center px-2 font-mono text-xs whitespace-nowrap",
      selected && "bg-accent",
      isSlow(row) && "bg-destructive/10"
    )}
    style={{ height: ROW, transform: `translateY(${start}px)` }}
  >
    <span className="text-muted-foreground">{row.index}</span>
    <span className="text-muted-foreground">{clock(row.time)}</span>
    <span className="truncate">
      {row.userEvent ?? <span className="text-muted-foreground">–</span>}
    </span>
    <span className="flex gap-1">
      {flags(row).map((flag) => (
        <Tag key={flag}>{flag}</Tag>
      ))}
    </span>
    {/* No tooltip per cell (a busy log re-renders its rows often): the column headers have them. */}
    <span>{row.effects || ""}</span>
    <span>{row.annotations.length || ""}</span>
    <span className={cn("text-right", slow(row.dispatchMs) && slowText)}>{ms(row.dispatchMs)}</span>
    <span
      data-flush={row.flush ?? undefined}
      aria-label={flushTitle(row)}
      className={cn("text-right", slow(row.flushMs) && slowText)}
    >
      {ms(row.flushMs)}
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
