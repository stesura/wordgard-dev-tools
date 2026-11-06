import { cn } from "cn";
import { ChevronDownIcon, ChevronRightIcon } from "#icons";
import { Tag } from "#components/ui/badge";
import { hue, typeColour } from "#lib/colours.ts";
import type { Line } from "./dom-lines.ts";

export const ROW = 20;
const INDENT = 14;

export const Row = ({
  line,
  start,
  focused,
  match,
  onToggle,
}: {
  line: Line;
  start: number;
  focused: boolean;
  /** A search match's tint, in place of the focus's. */
  match: string;
  onToggle: (id: string) => void;
}) => {
  const { node } = line;
  const folder = node.children.length > 0;
  return (
    <div
      id={`view-${line.id || "root"}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={focused}
      data-dom={line.id}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap ring-inset",
        match || (focused && "bg-accent")
      )}
      style={{
        height: ROW,
        transform: `translateY(${start}px)`,
        paddingLeft: line.depth * INDENT + 4,
      }}
    >
      <span className="flex w-3 shrink-0 justify-center text-muted-foreground [&_svg]:size-3">
        {folder && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={line.collapsed ? "Expand" : "Collapse"}
            className="cursor-pointer"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(line.id);
            }}
          >
            {line.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </button>
        )}
      </span>
      {node.kind == "text" ? (
        <>
          <span className="truncate text-green-700 dark:text-green-400">
            {JSON.stringify(node.text)}
          </span>
          {node.pos != null && <span className="text-muted-foreground">pos {node.pos}</span>}
        </>
      ) : (
        <>
          {/* Long attribute lists are cut, not the node's badges after them. */}
          <span className="min-w-0 truncate text-sky-700 dark:text-sky-400">
            &lt;{node.tag}
            {node.attrs.length > 0 && (
              <span className="text-muted-foreground">
                {node.attrs.map(([name, value]) => ` ${name}="${value}"`).join("")}
              </span>
            )}
            &gt;
          </span>
          {node.node && (
            <Tag className={cn("shrink-0", typeColour)} style={hue("node", node.node.name)}>
              {node.node.name} {node.node.from}–{node.node.to}
            </Tag>
          )}
          {node.chrome && <Tag className="shrink-0">chrome</Tag>}
        </>
      )}
    </div>
  );
};
