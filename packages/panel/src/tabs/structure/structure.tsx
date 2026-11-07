import { createOutline } from "#lib/outline.ts";
import { whileShown } from "#stores/while-shown.ts";
import { ExpandCollapse } from "#components/expand-collapse";
import { LoadError } from "#components/load-error";
import { Button } from "#components/ui/button";
import { Tip } from "#components/tip";
import { NoSymbolIcon } from "#icons";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Path, StructureNode } from "@stesura/wordgard-dev-tools";
import { ROOT, dataPath, itemId, pathOf } from "#lib/paths.ts";
import { NodeMenu, createNodeMenuAnchor } from "#components/node-menu";
import { NodePane } from "#components/node-pane";
import { isPrefix } from "#lib/paths.ts";
import { SearchBox, searchStrip, useSearch } from "#components/search-box";
import { SplitPane } from "#components/split-pane";
import type { PanelStore } from "#stores/panel-store.ts";
import { createStructureSource } from "./structure-source.ts";
import { scrollInto } from "#lib/dom.ts";
import { Box } from "./boxes.tsx";
import { persistent } from "#stores/persistent.ts";
import { DecorationList } from "./decoration-views.tsx";
import { createDecorationsSource, decorationsOf, indexDecorations } from "./decorations-source.ts";

// Whether the Structure shows decorations: off by default (nothing is asked of the page).
const showDecorations = () =>
  persistent("wordgard-devtools:structure-decorations", false, {
    decode: (text) => text == "true",
    encode: String,
  });

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

/** The item standing for `id`: itself, or its nearest ancestor still in the document and not in a closed box. */
const shownItem = (doc: StructureNode, id: string, collapsed: ReadonlySet<string>) => {
  let node = doc;
  for (const index of pathOf(id)) {
    const child = node.children[index];
    if (!child || collapsed.has(itemId(node.path))) break;
    node = child;
  }
  return itemId(node.path);
};

/** Whether focus is nowhere to be seen: on the body, in a closing menu, or in a hidden tab. */
const focusLost = (element: Element) => {
  let active = element.ownerDocument.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return (
    !active ||
    active == element.ownerDocument.body ||
    active.closest("[role='menu']") != null ||
    !active.checkVisibility()
  );
};

/** The whole document as nested boxes, with positions. Mounted per editor. */
export const Structure = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createStructureSource(store.transport, editorId));
  const { value: doc, error } = useStore(source.state);
  const { selection } = useStore(store.state);
  const info = selection?.id == editorId ? selection.info : null;
  // The selected node (shown in the pane), and the item holding the tree's tab stop. Selection follows
  // focus; Escape clears the selection, not the focus.
  const [selected, setSelected] = useState<string | null>(null);
  const [active, setActive] = useState<string>(ROOT);
  const scroller = useRef<HTMLDivElement | null>(null);
  // A clicked box's node is outlined in the page until another is clicked, or the tab or editor changes.
  const [outline] = useState(() => createOutline(store.transport, editorId));
  const [decorationsSource] = useState(() => createDecorationsSource(store.transport, editorId));
  const [decorationsOn] = useState(showDecorations);
  const showing = useStore(decorationsOn);
  const decorations = useStore(decorationsSource.state);
  const index = showing && decorations.value ? indexDecorations(decorations.value) : null;

  // Selects a node and scrolls to it, once the structure holding it has loaded and rendered. Takes
  // focus only when it's lost (a "Show in Structure" from another tab's menu), not from the page or
  // the search box.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const reveal = useCallback(
    async (path: Path) => {
      setSelected(itemId(path));
      setActive(itemId(path));
      // Selected, so outlined: the picker's own outline went with the click.
      outline.show(path);
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
        if (element instanceof HTMLElement && focusLost(element))
          element.focus({ preventScroll: true });
        return;
      }
    },
    [source, setCollapsed, outline]
  );

  // Loads while its tab is shown: on showing (when the document changed meanwhile) and on each
  // document change. Takes a pick's reveal while shown.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      scroller.current = element;
      if (!element) return;
      const stop = whileShown(store, {
        tab: "structure",
        editorId,
        on: "doc",
        load: () => void source.load(),
        onHide: outline.hide,
        onReveal: () => {
          // From the Log: what a flush changed, with the decorations shown.
          if (store.takeDecorationsReveal(editorId) && !decorationsOn.get()) {
            decorationsOn.set(true);
            void decorationsSource.load();
          }
          const path = store.takeReveal(editorId);
          if (path) void reveal(path);
        },
      });
      // On every state change, not only the document's: a source can follow the selection.
      const stopDecorations = whileShown(store, {
        tab: "structure",
        editorId,
        on: "state",
        load: () => {
          if (decorationsOn.get()) void decorationsSource.load();
        },
      });
      return () => {
        outline.hide();
        stop();
        stopDecorations();
        scroller.current = null;
      };
    },
    [store, editorId, source, reveal, outline, decorationsOn, decorationsSource]
  );

  const focusItem = (element: Element | null) => {
    const path = dataPath(element);
    if (!element || !path || !(element instanceof HTMLElement)) return;
    setSelected(itemId(path));
    setActive(itemId(path));
    element.focus({ preventScroll: true });
    // Found from the item, not the scroller ref: the context menu's anchor, built during render,
    // holds this function, and the React Compiler rejects refs reached from render.
    const tree = element.closest("[role='tree']");
    if (tree instanceof HTMLElement) scrollInto(tree, element);
  };

  // A click or a key: the node is selected, focused and outlined in the page.
  const select = (element: Element | null) => {
    focusItem(element);
    const path = dataPath(element);
    if (path) outline.show(path);
  };

  // Closing a box that holds the selected or focused node moves them to the box.
  const toggle = (id: string) => {
    const closing = !collapsed.has(id);
    setCollapsed((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    const inside = (other: string | null) =>
      other != null && other != id && isPrefix(pathOf(id), pathOf(other));
    if (closing && inside(selected)) setSelected(id);
    if (closing && inside(active)) setActive(id);
  };

  // The box a context menu opens on takes focus.
  const [menu] = useState(() => createNodeMenuAnchor((row) => focusItem(row)));

  const clear = () => {
    setSelected(null);
    outline.hide();
  };

  // A tree's keys (WAI-ARIA): Up and Down walk the items shown, in document order; Right opens a
  // closed box or goes to its first child; Left closes an open one or goes to the parent; Home and
  // End jump to the ends. Enter scrolls the node into view in the editor (as a double-click);
  // Escape clears the selection.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key == "Escape" && selected != null) {
      event.preventDefault();
      clear();
      return;
    }
    const item = itemOf(event.target);
    const path = dataPath(item);
    if (!item || !path) return;
    if (event.key == "Enter") {
      event.preventDefault();
      fire(store.transport, { type: "scrollIntoView", id: editorId, path });
      return;
    }
    const expanded = item.getAttribute("aria-expanded");
    if (
      (event.key == "ArrowRight" && expanded == "false") ||
      (event.key == "ArrowLeft" && expanded == "true")
    ) {
      event.preventDefault();
      toggle(itemId(path));
      return;
    }
    // The items shown: a closed box's content isn't rendered.
    const items = [...event.currentTarget.querySelectorAll("[role='treeitem']")];
    const at = items.indexOf(item);
    const targets: Partial<Record<string, Element | null>> = {
      ArrowDown: items[at + 1],
      ArrowUp: items[at - 1],
      Home: items[0],
      End: items.at(-1),
      ArrowRight: item.querySelector("[role='treeitem']"),
      ArrowLeft: item.parentElement?.closest("[role='treeitem']"),
    };
    if (!(event.key in targets)) return;
    // Also at an end: the arrows don't scroll the tree.
    event.preventDefault();
    const target = targets[event.key];
    if (target) select(target);
  };

  const find = doc ? (query: string) => search(doc, query) : null;
  const searching = useSearch(find, (id) => void reveal(pathOf(id)));

  const marks = {
    selection: info,
    selected,
    // Never in a closed box, nor gone with an edit: the tree keeps its tab stop.
    active: doc ? shownItem(doc, active, collapsed) : ROOT,
    all: searching.all,
    current: searching.current,
    collapsed,
    toggle,
    decorations: index,
  };

  const toggleDecorations = () => {
    const on = !decorationsOn.get();
    decorationsOn.set(on);
    if (on) void decorationsSource.load();
  };
  const failed = index?.sources.filter((s) => s.error != null) ?? [];
  // The document isn't shown in the pane.
  const paneId = selected == ROOT ? null : selected;

  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <LoadError what="the structure" error={error} onRetry={() => void source.load()} />
      <div className={searchStrip}>
        <SearchBox
          search={searching}
          label="Search the structure"
          placeholder="Search text, node names, params"
        />
        <span className="flex items-center gap-1">
          {index && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {index.total} decoration{index.total == 1 ? "" : "s"} from {index.sources.length}{" "}
              source{index.sources.length == 1 ? "" : "s"}
              {failed.length > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {failed.length} failed: {failed.map((s) => s.error).join("; ")}
                </span>
              )}
            </span>
          )}
          {showing && decorations.error != null && (
            <span className="text-xs text-destructive">{decorations.error}</span>
          )}
          <Tip label="Show the editor's decorations: widgets, attributes, shapes and wrappers">
            <Button
              variant="ghost"
              size="xs"
              aria-pressed={showing}
              onClick={toggleDecorations}
              className="aria-pressed:bg-foreground/10 aria-pressed:shadow-[inset_0_-2px_0_var(--color-ring)]"
            >
              Decorations
            </Button>
          </Tip>
          <Tip label="Clear the selection and its outline in the page">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear the selection"
              disabled={selected == null}
              onClick={clear}
            >
              <NoSymbolIcon />
            </Button>
          </Tip>
          <ExpandCollapse
            onExpand={() => setCollapsed(new Set())}
            // The document stays open: its blocks show. The selection goes to the block holding it.
            onCollapse={() => {
              if (!doc) return;
              const next = new Set(folders(doc).filter((id) => id != ROOT));
              setCollapsed(next);
              if (selected != null) setSelected(shownItem(doc, selected, next));
              setActive(shownItem(doc, active, next));
            }}
          />
        </span>
      </div>
      <SplitPane
        pane={
          <NodePane
            source={source}
            focused={paneId}
            onShowType={(kind, name) => store.showType(editorId, name, kind)}
            onLog={(path, part) =>
              fire(
                store.transport,
                part == "json"
                  ? { type: "logNode", id: editorId, path, json: true }
                  : { type: "logNode", id: editorId, path, part }
              )
            }
          >
            {index && (
              <DecorationList
                title={paneId == null ? "The document's decorations" : "Decorations"}
                items={decorationsOf(index, paneId == null ? [] : pathOf(paneId))}
                index={index}
                onLog={(item) =>
                  fire(store.transport, {
                    type: "logDecoration",
                    id: editorId,
                    source: item.source,
                    index: item.index,
                  })
                }
              />
            )}
          </NodePane>
        }
      >
        <div
          ref={container}
          role="tree"
          aria-label="Document structure"
          className="min-w-0 flex-1 overflow-auto p-2 font-mono text-xs"
          onClick={(event: MouseEvent) => select(itemOf(event.target))}
          // Scrolls the node into view in the editor.
          onDoubleClick={(event: MouseEvent) => {
            const path = dataPath(itemOf(event.target));
            if (path) fire(store.transport, { type: "scrollIntoView", id: editorId, path });
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
