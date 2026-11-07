import { cn } from "cn";
import { ChevronDownIcon, ChevronUpIcon } from "#icons";
import { Tip } from "./tip.tsx";

/** A table's order: a column, ascending or descending. */
export type SortBy<K extends string> = { key: K; descending: boolean };

/** A column heading that sorts the rows: ascending first, then descending. */
export const SortHeading = <K extends string>({
  sortKey,
  label,
  tip,
  sort,
  onSort,
  right,
}: {
  sortKey: K;
  label: string;
  tip: string;
  sort: SortBy<K>;
  onSort: (sort: SortBy<K>) => void;
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
