import { cn } from "cn";
import { ChevronDownIcon, ChevronRightIcon } from "#icons";
import type { Line } from "./json-lines.ts";

// The chevron's target is 24 × 24 (WCAG 2.5.8): the row is its height.
export const ROW = 24;
const INDENT = 14;

const valueColour: Record<Line["type"], string> = {
  string: "text-green-700 dark:text-green-400",
  number: "text-amber-700 dark:text-amber-400",
  boolean: "text-violet-700 dark:text-violet-300",
  null: "text-muted-foreground",
  bracket: "text-muted-foreground",
};

export const Row = ({
  line,
  start,
  selected,
  focused,
  match,
  onToggle,
}: {
  line: Line;
  start: number;
  selected: boolean;
  focused: boolean;
  /** A search match's tint, in place of the selection's. */
  match: string;
  onToggle: (id: string) => void;
}) => {
  const folder = line.kind == "open" && line.size > 0;
  return (
    <div
      id={`state-${line.id}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-posinset={line.position}
      aria-setsize={line.siblings}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={selected}
      data-line={line.id}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap ring-inset",
        match || (selected && "bg-accent"),
        // The cursor, inside a selected object too.
        // Wider under a match's inset outline, which covers its first 2px.
        focused &&
          (match
            ? "shadow-[inset_5px_0_0_var(--color-ring)]"
            : "shadow-[inset_3px_0_0_var(--color-ring)]")
      )}
      style={{
        height: ROW,
        transform: `translateY(${start}px)`,
        paddingLeft: line.depth * INDENT,
      }}
    >
      {/* The target, empty on a leaf (for the alignment), for the mouse: out of the item's name
          (aria-expanded says it). -mr-1 takes back the row's gap: the
          icon, centred, already stands 6px off the text. */}
      <span className="-mr-1 flex size-6 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3">
        {folder && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            aria-label={line.collapsed ? "Expand" : "Collapse"}
            className="flex size-6 cursor-pointer items-center justify-center"
            // Hidden: never focused (focus stays on the tree).
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(line.id);
            }}
          >
            {line.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </button>
        )}
      </span>
      {line.key != null && (
        <span className="text-sky-700 dark:text-sky-400">{JSON.stringify(line.key)}:</span>
      )}
      <span className={cn("truncate", valueColour[line.type])}>{line.text}</span>
      {line.collapsed && (
        <span className="text-muted-foreground">
          {line.size} {line.text.startsWith("[") ? "items" : "keys"}
        </span>
      )}
    </div>
  );
};
