import { cn } from "cn";
import { ChevronDownIcon, ChevronRightIcon } from "#icons";
import type {
  DecorationInfo,
  Path,
  SelectionInfo,
  StructureNode,
} from "@stesura/wordgard-dev-tools";
import { Fragment, type ReactNode } from "react";
import { Tag } from "#components/ui/badge";
import { itemId } from "#lib/paths.ts";
import { isPrefix } from "#lib/paths.ts";
import { json } from "#lib/json.ts";
import { matchClass } from "#components/search-box";
import { hue, markColour, typeColour } from "#lib/colours.ts";
import { DecorationBadge, WidgetChip } from "./decoration-views.tsx";
import { pathKey, type DecorationIndex } from "./decorations-source.ts";

type Marks = {
  selection: SelectionInfo | null;
  /** The selected node, and the item holding the tree's tab stop (roving focus). */
  selected: string | null;
  active: string;
  /** Search matches, and the one stepped to. */
  all: ReadonlySet<string>;
  current: string | null;
  /** Boxes whose content is hidden. */
  collapsed: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** Shown while the toolbar's toggle is on. */
  decorations: DecorationIndex | null;
};

/** The widgets between a node's children: each before the first child at or after it. */
const widgetSlots = (node: StructureNode, index: DecorationIndex | null) => {
  const widgets = (index?.widgets.get(pathKey(node.path)) ?? [])
    .filter((w) => w.offset == null)
    .toSorted((a, b) => a.from - b.from);
  const slots: DecorationInfo[][] = node.children.map(() => []);
  const after: DecorationInfo[] = [];
  for (const widget of widgets) {
    const at = node.children.findIndex((child) => child.from >= widget.from);
    (at < 0 ? after : slots[at])?.push(widget);
  }
  return { slots, after };
};

/** A node's children, with the widgets between them. */
const Content = ({
  node,
  marks,
  render,
}: {
  node: StructureNode;
  marks: Marks;
  render: (child: StructureNode) => ReactNode;
}) => {
  const index = marks.decorations;
  const { slots, after } = widgetSlots(node, index);
  const chips = (widgets: DecorationInfo[] | undefined) =>
    index &&
    widgets?.map((w, i) => (
      <WidgetChip key={`w${w.source}.${w.index}.${i}`} item={w} index={index} />
    ));
  return (
    <>
      {node.children.map((child, i) => (
        <Fragment key={child.path.join(".")}>
          {chips(slots[i])}
          {render(child)}
        </Fragment>
      ))}
      {chips(after)}
    </>
  );
};

/** Longer texts aren't split at their widgets. */
const LONG_TEXT = 200;

/** Widgets between the node's children (or in it, when it has none). */
const hasWidgets = (node: StructureNode, index: DecorationIndex | null) =>
  index?.widgets.get(pathKey(node.path))?.some((w) => w.offset == null) ?? false;

/** A text leaf's text, with the widgets inside it at their offsets. */
const TextWithWidgets = ({ node, marks }: { node: StructureNode; marks: Marks }) => {
  const index = marks.decorations;
  const inside = (index?.widgets.get(pathKey(node.path)) ?? []).filter((w) => w.offset != null);
  const text = node.text;
  if (!index || !inside.length || text == null)
    return <span className="whitespace-pre">{json(node.textPreview)}</span>;
  // A long text stays truncated: its widgets follow it.
  if (text.length > LONG_TEXT)
    return (
      <span className="whitespace-pre">
        {json(node.textPreview)}
        {inside.map((w, i) => (
          <WidgetChip key={i} item={w} index={index} />
        ))}
      </span>
    );
  const cuts = [...new Set(inside.map((w) => w.offset ?? 0))].toSorted((a, b) => a - b);
  const pieces = [0, ...cuts].map((start, i) => text.slice(start, cuts[i] ?? text.length));
  const quoted = (piece: string) => JSON.stringify(piece).slice(1, -1);
  return (
    <span className="whitespace-pre">
      &quot;
      {pieces.map((piece, i) => (
        <span key={i}>
          {i > 0 &&
            inside
              .filter((w) => w.offset == cuts[i - 1])
              .map((w, j) => <WidgetChip key={j} item={w} index={index} />)}
          {quoted(piece)}
        </span>
      ))}
      &quot;
    </span>
  );
};

const selectionMark = (path: Path, selection: SelectionInfo | null) => {
  if (!selection || !path.length) return undefined;
  const exact = (other: Path) => other.join() == path.join();
  if (selection.nodePath) {
    if (exact(selection.nodePath)) return "innermost";
    return isPrefix(path, selection.nodePath) ? "holds" : undefined;
  }
  if (selection.cells) {
    const { paths } = selection.cells;
    if (paths.some(exact)) return "innermost";
    return paths.some((cell) => isPrefix(path, cell)) ? "holds" : undefined;
  }
  if (exact(selection.headPath) || exact(selection.anchorPath)) return "innermost";
  return isPrefix(path, selection.headPath) || isPrefix(path, selection.anchorPath)
    ? "holds"
    : undefined;
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
    "aria-selected": marks.selected == id,
    // Roving focus: the active item is the one Tab reaches.
    tabIndex: marks.active == id ? 0 : -1,
  };
};

// Selected: a ring. Focused by keyboard but not selected (after Escape): a fainter one. Rings are box
// shadows, which forced colours drop: outlines there.
const itemFocus =
  "focus-visible:outline-hidden aria-selected:ring-2 aria-selected:ring-ring focus-visible:not-aria-selected:ring-2 focus-visible:not-aria-selected:ring-ring/50 forced-colors:aria-selected:outline-2 forced-colors:aria-selected:outline-offset-1 forced-colors:aria-selected:outline-solid forced-colors:aria-selected:outline-[Highlight]";

/** A text leaf or an inline node, in a row with its siblings (an inline plot holds its own row). */
const Chip = ({ node, marks }: { node: StructureNode; marks: Marks }) => {
  const props = itemProps(node, marks);
  return (
    <span
      {...props}
      className={cn(
        "mr-1 mb-1 inline-flex cursor-default flex-wrap items-center gap-1 rounded border px-1 align-top",
        itemFocus,
        node.name == "Text" && "border-r-2 border-r-slate-400 dark:border-r-slate-500",
        props["data-selection"] == "innermost" && "border-primary",
        matchClass(itemId(node.path), marks)
      )}
    >
      {node.name == "Text" && node.textPreview != null ? (
        <TextWithWidgets node={node} marks={marks} />
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
      {marks.decorations && (
        <DecorationBadge
          items={marks.decorations.on.get(pathKey(node.path))}
          index={marks.decorations}
        />
      )}
      <span className="text-muted-foreground">
        {node.from}–{node.to}
      </span>
      {(node.children.length > 0 || hasWidgets(node, marks.decorations)) && (
        <span role="group" className="inline-flex flex-wrap">
          <Content
            node={node}
            marks={marks}
            render={(child) => <Chip node={child} marks={marks} />}
          />
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
  // An empty node holding a widget (a placeholder) opens to show it.
  const folder = node.children.length > 0 || hasWidgets(node, marks.decorations);
  const open = folder && !marks.collapsed.has(id);
  return (
    <div
      {...props}
      aria-expanded={folder ? open : undefined}
      className={cn(
        // The browser skips laying out and painting boxes off-screen (it keeps their last size).
        "mb-1 cursor-default rounded border border-l-4 border-l-[hsl(var(--hue)_60%_50%)] px-1.5 py-0.5 [contain-intrinsic-size:auto_1.875rem] [content-visibility:auto]",
        itemFocus,
        // Opaque: a translucent tint would add up box in box, and nested deep, muted text on it
        // falls under 4.5:1.
        props["data-selection"] && "bg-[color-mix(in_oklab,var(--primary)_5%,var(--background))]"
      )}
      style={hue("node", node.name)}
    >
      {/* -mx-0.5 px-0.5: a match's inset outline clears the chevron and the range. 24px high: the
          chevron's target (the box clips what overflows it). */}
      <div className={cn("-mx-0.5 flex min-h-6 items-center gap-2 px-0.5", matchClass(id, marks))}>
        {folder && (
          // For the mouse: out of the item's name (aria-expanded says it) and never focused. Focus
          // in the content it closes goes to the box. A 24px target around the 14px icon.
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            aria-label={open ? "Collapse" : "Expand"}
            className="relative -mr-1 flex size-3.5 cursor-pointer items-center justify-center text-muted-foreground before:absolute before:-inset-[5px] [&_svg]:size-3"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              // Toggles only: not a click on the box.
              event.stopPropagation();
              const item = event.currentTarget.closest("[role='treeitem']");
              if (open && item instanceof HTMLElement && item.matches(":focus-within:not(:focus)"))
                item.focus({ preventScroll: true });
              marks.toggle(id);
            }}
          >
            {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          </button>
        )}
        <span>{node.name}</span>
        {node.paramPreview != null && (
          <span className="text-muted-foreground">{node.paramPreview}</span>
        )}
        <MarkTags node={node} />
        {marks.decorations && (
          <DecorationBadge
            items={marks.decorations.on.get(pathKey(node.path))}
            index={marks.decorations}
          />
        )}
        <span className="ml-auto text-muted-foreground">
          {node.from}–{node.to}
        </span>
      </div>
      {open && (
        <div role="group" className={cn("pt-0.5 pl-0.75", inline && "flex flex-wrap")}>
          <Content
            node={node}
            marks={marks}
            render={(child) =>
              inline ? <Chip node={child} marks={marks} /> : <Box node={child} marks={marks} />
            }
          />
        </div>
      )}
    </div>
  );
};
