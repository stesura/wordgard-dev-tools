import { cn } from "cn";
import {
  SelectionEndIcon,
  SelectionStartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronDownUpIcon,
  ChevronUpDownIcon,
  NodeSelectionIcon,
  TextCursorIcon,
} from "#icons";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import type { Path, SelectionInfo, StructureNode } from "@stesura/wordgard-dev-tools";
import { Tag } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { ROOT, itemId, pathOf } from "./detail-cache.ts";
import { NodeMenu, createNodeMenuAnchor } from "./node-menu.tsx";
import { NodePane, isPrefix, json } from "./node-pane.tsx";
import { SearchBox, matchClass, useSearch } from "./search.tsx";
import { SplitPane } from "./split-pane.tsx";
import { hue, markColour, typeColour } from "./colours.ts";
import type { PanelStore } from "./store.ts";
import { Tip } from "./tip.tsx";
import { createStructureSource } from "./structure-source.ts";

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

/** The ids of the nodes matching a search, in document order: text leaves by their text, others by name or param. */
const search = (doc: StructureNode, query: string) => {
  const needle = query.toLowerCase();
  const found: string[] = [];
  const walk = (node: StructureNode) => {
    const haystack = node.text ?? `${node.name} ${node.paramPreview ?? ""}`;
    if (node.path.length && haystack.toLowerCase().includes(needle)) found.push(itemId(node.path));
    node.children.forEach(walk);
  };
  walk(doc);
  return found;
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
const Box = ({ node, marks }: { node: StructureNode; marks: Marks }) => {
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

/** The boxes that hold content: what "collapse all" closes. A textblock's content is chips, not boxes. */
const folders = (node: StructureNode, out: string[] = []) => {
  if (!node.children.length) return out;
  out.push(itemId(node.path));
  if (node.textPreview == null) for (const child of node.children) folders(child, out);
  return out;
};

/** Scrolls an item into the structure's scroller, not the page around an in-page dock. */
/** `inset`: what covers the container's top (a sticky heading). */
export const scrollInto = (container: HTMLElement, element: Element, inset = 0) => {
  const top =
    element.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop;
  if (
    top < container.scrollTop + inset ||
    top > container.scrollTop + container.clientHeight - 24
  ) {
    container.scrollTop = top - inset - 8;
  }
};

const itemOf = (target: EventTarget) =>
  target instanceof Element ? target.closest("[data-path]") : null;

const pathOfItem = (element: Element | null) => {
  const path = element?.getAttribute("data-path");
  return path == null ? null : path ? path.split(".").map(Number) : [];
};

/** The whole document as nested boxes, with positions. Mounted per editor. */
export const Structure = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createStructureSource(store.transport, editorId));
  const doc = useSyncExternalStore(source.subscribe, source.doc);
  const error = useSyncExternalStore(source.subscribe, source.error);
  const { selection } = useSyncExternalStore(store.subscribe, store.get);
  const info = selection?.id == editorId ? selection.info : null;
  const [focused, setFocused] = useState<string>(ROOT);
  const scroller = useRef<HTMLDivElement | null>(null);
  // A clicked box's node is outlined in the page until another is clicked, or the tab or editor changes.
  const outlined = useRef(false);
  const highlight = useCallback(
    (path: Path | null) => {
      if (!path && !outlined.current) return;
      outlined.current = path != null;
      store.transport.send({ type: "highlight", id: editorId, path }).catch(() => {});
    },
    [store, editorId]
  );

  // Focuses a node and scrolls to it, once the structure holding it has loaded and rendered.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const reveal = useCallback(
    async (path: Path) => {
      setFocused(itemId(path));
      // Its ancestors open.
      setCollapsed((ids) => {
        const ancestors = path.map((_, depth) => itemId(path.slice(0, depth)));
        if (!ancestors.some((id) => ids.has(id))) return ids;
        return new Set([...ids].filter((id) => !ancestors.includes(id)));
      });
      await source.ready();
      for (let frame = 0; frame < 30; frame++) {
        await new Promise(requestAnimationFrame);
        const container = scroller.current;
        const element = container?.querySelector(`[data-path='${path.join(".")}']`);
        if (!container || !element) continue;
        scrollInto(container, element);
        return;
      }
    },
    [source]
  );

  // Loads while its tab is shown: on showing (when the document changed meanwhile) and on each
  // document change. Takes a pick's reveal while shown.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element;
      if (!element) return;
      const shown = () => store.get().view == "structure";
      let stale = true;
      const load = () => {
        stale = false;
        void source.load();
      };
      const takeReveal = () => {
        if (!shown()) return;
        const path = store.takeReveal(editorId);
        if (path) void reveal(path);
      };
      const stopDoc = store.onDocChanged((id) => {
        if (id != editorId) return;
        if (shown()) load();
        else stale = true;
      });
      const stopStore = store.subscribe(() => {
        if (!shown()) highlight(null);
        else if (stale) load();
      });
      const stopReveal = store.onReveal(takeReveal);
      if (shown()) load();
      takeReveal();
      return () => {
        highlight(null);
        stopDoc();
        stopStore();
        stopReveal();
        scroller.current = null;
      };
    },
    [store, editorId, source, reveal, highlight]
  );

  const focusItem = (element: Element | null) => {
    const path = pathOfItem(element);
    if (!element || !path || !(element instanceof HTMLElement)) return;
    setFocused(itemId(path));
    element.focus({ preventScroll: true });
    // Found from the item, not the scroller ref: the context menu's anchor, built during render,
    // holds this function, and the React Compiler rejects refs reached from render.
    const tree = element.closest("[role='tree']");
    if (tree instanceof HTMLElement) scrollInto(tree, element);
  };

  // Closing a box that holds the focused node moves focus to the box.
  const toggle = (id: string) => {
    const closing = !collapsed.has(id);
    setCollapsed((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    const path = pathOf(id);
    if (closing && focused != id && isPrefix(path, pathOf(focused))) setFocused(id);
  };

  // The box a context menu opens on takes focus.
  const [menu] = useState(() => createNodeMenuAnchor((row) => focusItem(row)));

  // Arrows walk the items in document order; Home and End jump to the ends.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const items = [...(scroller.current?.querySelectorAll("[role='treeitem']") ?? [])];
    const index = items.findIndex(
      (item) => pathOfItem(item)?.join(".") == pathOf(focused).join(".")
    );
    // As in a tree: Right opens a closed box, Left closes an open one; otherwise they walk.
    const item = items[index];
    if (item?.getAttribute("aria-expanded") == (event.key == "ArrowRight" ? "false" : "true")) {
      if (event.key == "ArrowRight" || event.key == "ArrowLeft") {
        event.preventDefault();
        toggle(focused);
        return;
      }
    }
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1,
    };
    const target =
      event.key == "Home"
        ? items[0]
        : event.key == "End"
          ? items.at(-1)
          : event.key in step
            ? items[Math.max(0, Math.min(items.length - 1, index + (step[event.key] ?? 0)))]
            : undefined;
    if (!target) return;
    event.preventDefault();
    focusItem(target);
  };

  const find = doc ? (query: string) => search(doc, query) : null;
  const searching = useSearch(find, (id) => void reveal(pathOf(id)));

  const marks = {
    selection: info,
    focused,
    all: searching.all,
    current: searching.current,
    collapsed,
    toggle,
  };

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the structure: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 text-xs">
        <SearchBox
          search={searching}
          label="Search the structure"
          placeholder="Search text, node names, params"
        />
        <Tip label="Expand all">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Expand all"
            onClick={() => setCollapsed(new Set())}
          >
            <ChevronUpDownIcon />
          </Button>
        </Tip>
        <Tip label="Collapse all">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Collapse all"
            // The document stays open: its blocks show.
            onClick={() => doc && setCollapsed(new Set(folders(doc).filter((id) => id != ROOT)))}
          >
            <ChevronDownUpIcon />
          </Button>
        </Tip>
      </div>
      <SplitPane
        pane={
          <NodePane
            source={source}
            focused={focused == ROOT ? null : focused}
            onShowType={(kind, name) => store.showType(editorId, name, kind)}
            onLog={(path, part) =>
              store.transport
                .send(
                  part == "json"
                    ? { type: "logNode", id: editorId, path, json: true }
                    : { type: "logNode", id: editorId, path, part }
                )
                .catch(() => {})
            }
          />
        }
      >
        <div
          ref={container}
          role="tree"
          aria-label="Document structure"
          className="min-w-0 flex-1 overflow-auto p-2 font-mono text-xs"
          onClick={(event: MouseEvent) => {
            const item = itemOf(event.target);
            focusItem(item);
            const path = pathOfItem(item);
            if (path) highlight(path);
          }}
          // Scrolls the node into view in the editor.
          onDoubleClick={(event: MouseEvent) => {
            const path = pathOfItem(itemOf(event.target));
            if (path)
              store.transport.send({ type: "scrollIntoView", id: editorId, path }).catch(() => {});
          }}
          onKeyDown={onKeyDown}
          onContextMenu={menu.onContextMenu}
        >
          {doc && <Box node={doc} marks={marks} />}
        </div>
      </SplitPane>
      <NodeMenu store={store} editorId={editorId} anchor={menu} />
    </div>
  );
};
