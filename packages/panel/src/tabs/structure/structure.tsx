import { useStore } from "@nanostores/react";
import { ChevronDownUpIcon, ChevronUpDownIcon } from "#icons";
import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Path, StructureNode } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import { ROOT, itemId, pathOf } from "#lib/paths.ts";
import { NodeMenu, createNodeMenuAnchor } from "#components/node-menu";
import { NodePane } from "#components/node-pane";
import { isPrefix } from "#lib/paths.ts";
import { SearchBox, useSearch } from "#components/search-box";
import { SplitPane } from "#components/split-pane";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { createStructureSource } from "./structure-source.ts";
import { scrollInto } from "#lib/dom.ts";
import { Box } from "./boxes.tsx";

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

/** The boxes that hold content: what "collapse all" closes. A textblock's content is chips, not boxes. */
const folders = (node: StructureNode, out: string[] = []) => {
  if (!node.children.length) return out;
  out.push(itemId(node.path));
  if (node.textPreview == null) for (const child of node.children) folders(child, out);
  return out;
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
  const { doc, error } = useStore(source.state);
  const { selection } = useStore(store.state);
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
      const shown = () => store.state.get().tab == "structure";
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
      const stopStore = store.state.listen(() => {
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
