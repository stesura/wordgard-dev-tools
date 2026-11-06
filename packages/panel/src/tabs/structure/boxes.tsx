import { cn } from "cn";
import {
  SelectionEndIcon,
  SelectionStartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  NodeSelectionIcon,
  TextCursorIcon,
} from "#icons";
import type { Path, SelectionInfo, StructureNode } from "@stesura/wordgard-dev-tools";
import { Tag } from "#components/ui/badge";
import { itemId } from "#lib/paths.ts";
import { isPrefix } from "#lib/paths.ts";
import { json } from "#lib/json.ts";
import { matchClass } from "#components/search-box";
import { hue, markColour, typeColour } from "#lib/colours.ts";
import { Tip } from "#components/tip";

type Marks = {
  selection: SelectionInfo | null;
  focused: string;
  /** Search matches, and the one stepped to. */
  all: ReadonlySet<string>;
  current: string | null;
  /** Boxes whose content is hidden. */
  collapsed: ReadonlySet<string>;
  toggle: (id: string) => void;
};

const selectionMark = (path: Path, selection: SelectionInfo | null) => {
  if (!selection || !path.length) return undefined;
  const exact = (other: Path) => other.join() == path.join();
  if (selection.nodePath) {
    if (exact(selection.nodePath)) return "innermost";
    return isPrefix(path, selection.nodePath) ? "holds" : undefined;
  }
  if (exact(selection.headPath) || exact(selection.anchorPath)) return "innermost";
  return isPrefix(path, selection.headPath) || isPrefix(path, selection.anchorPath)
    ? "holds"
    : undefined;
};

/**
 * Where the selection starts or ends, in the innermost node holding that position: its own mark
 * for each end (one for a cursor), with the position in a tooltip.
 */
const SelectionEnd = ({
  node,
  marks,
  at,
}: {
  node: StructureNode;
  marks: Marks;
  at: "start" | "end";
}) => {
  const selection = marks.selection;
  if (!selection) return null;
  // A node selection: the node itself, once.
  if (selection.nodePath) {
    if (at == "end" || selection.nodePath.join(".") != node.path.join(".")) return null;
    const label = `Selected node - pos ${selection.from}–${selection.to}`;
    return (
      <Tip label={label}>
        <span
          data-selection-end="node"
          aria-label={label}
          className="flex text-primary [&_svg]:size-3"
        >
          <NodeSelectionIcon />
        </span>
      </Tip>
    );
  }
  if (selection.empty && at == "end") return null;
  const forward = selection.anchor <= selection.head;
  const path = (at == "start") == forward ? selection.anchorPath : selection.headPath;
  if (path.join(".") != node.path.join(".")) return null;
  const [label, icon] = selection.empty
    ? [`Cursor - pos ${selection.head}`, <TextCursorIcon key="cursor" />]
    : at == "start"
      ? [`Start of selection - pos ${selection.from}`, <SelectionStartIcon key="start" />]
      : [`End of selection - pos ${selection.to}`, <SelectionEndIcon key="end" />];
  return (
    <Tip label={label}>
      <span data-selection-end={at} aria-label={label} className="flex text-primary [&_svg]:size-3">
        {icon}
      </span>
    </Tip>
  );
};

const MarkTags = ({ node }: { node: StructureNode }) =>
  node.marks.map((mark) => (
    <Tag key={mark.name} className={markColour} style={hue("mark", mark.name)}>
      {mark.name}
      {mark.preview != null && `=${mark.preview}`}
    </Tag>
  ));

const itemProps = (node: StructureNode, marks: Marks) => {
  const id = itemId(node.path);
  return {
    "data-path": node.path.join("."),
    "data-name": node.path.length ? node.name : undefined,
    "data-selection": selectionMark(node.path, marks.selection),
    role: "treeitem",
    "aria-level": node.path.length + 1,
    "aria-selected": marks.focused == id,
    // Roving focus: the focused item is the one Tab reaches.
    tabIndex: marks.focused == id ? 0 : -1,
  };
};

/** A text leaf or an inline node, in a row with its siblings (an inline plot holds its own row). */
const Chip = ({ node, marks }: { node: StructureNode; marks: Marks }) => {
  const props = itemProps(node, marks);
  return (
    <span
      {...props}
      className={cn(
        "mr-1 mb-1 inline-flex cursor-default flex-wrap items-center gap-1 rounded border px-1 align-top outline-none",
        node.name == "Text" && "border-r-2 border-r-slate-400 dark:border-r-slate-500",
        props["data-selection"] == "innermost" && "border-primary",
        props["aria-selected"] && "ring-2 ring-ring",
        matchClass(itemId(node.path), marks)
      )}
    >
      <SelectionEnd node={node} marks={marks} at="start" />
      {node.name == "Text" && node.textPreview != null ? (
        <span className="whitespace-pre">{json(node.textPreview)}</span>
      ) : (
        <>
          <span className={typeColour} style={hue("node", node.name)}>
            {node.name}
          </span>
          {node.paramPreview != null && (
            <span className="text-muted-foreground">{node.paramPreview}</span>
          )}
        </>
      )}
      <MarkTags node={node} />
      <span className="text-muted-foreground">
        {node.from}–{node.to}
      </span>
      <SelectionEnd node={node} marks={marks} at="end" />
      {node.children.length > 0 && (
        <span role="group" className="inline-flex flex-wrap">
          {node.children.map((child) => (
            <Chip key={child.path.join(".")} node={child} marks={marks} />
          ))}
        </span>
      )}
    </span>
  );
};

/** A block: its header (name, param, marks, from and to), then its content, nested. */
export const Box = ({ node, marks }: { node: StructureNode; marks: Marks }) => {
  const props = itemProps(node, marks);
  // A textblock's children are inline: a row of chips.
  const inline = node.textPreview != null;
  const id = itemId(node.path);
  const folder = node.children.length > 0;
  const open = folder && !marks.collapsed.has(id);
  return (
    <div
      {...props}
      aria-expanded={folder ? open : undefined}
      className={cn(
        // The browser skips laying out and painting boxes off-screen (it keeps their last size).
        "mb-1 cursor-default rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-1.5 py-0.5 outline-none [contain-intrinsic-size:auto_1.75rem] [content-visibility:auto]",
        props["data-selection"] && "bg-primary/5",
        props["aria-selected"] && "ring-2 ring-ring"
      )}
      style={hue("node", node.name)}
    >
      <div className={cn("flex items-center gap-2", matchClass(id, marks))}>
        {folder && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? "Collapse" : "Expand"}
            className="-mr-1 flex size-3.5 cursor-pointer items-center justify-center text-muted-foreground [&_svg]:size-3"
            onClick={(event) => {
              // Toggles only: not a click on the box.
              event.stopPropagation();
              marks.toggle(id);
            }}
          >
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        )}
        <SelectionEnd node={node} marks={marks} at="start" />
        <span>{node.name}</span>
        {node.paramPreview != null && (
          <span className="text-muted-foreground">{node.paramPreview}</span>
        )}
        <MarkTags node={node} />
        <SelectionEnd node={node} marks={marks} at="end" />
        <span className="ml-auto text-muted-foreground">
          {node.from}–{node.to}
        </span>
      </div>
      {open && (
        <div role="group" className={cn("pt-0.5 pl-0.75", inline && "flex flex-wrap")}>
          {node.children.map((child) =>
            inline ? (
              <Chip key={child.path.join(".")} node={child} marks={marks} />
            ) : (
              <Box key={child.path.join(".")} node={child} marks={marks} />
            )
          )}
        </div>
      )}
    </div>
  );
};
