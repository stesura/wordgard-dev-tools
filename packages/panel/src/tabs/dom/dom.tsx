import { useStore } from "@nanostores/react";
import {
  ChevronDownUpIcon,
  ChevronUpDownIcon,
  CommandLineIcon,
  InformationCircleIcon,
  NoSymbolIcon,
} from "#icons";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import type { Path, ViewNode } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import { SearchBox, matchClass, useSearch } from "#components/search-box";
import { centreRow } from "#lib/dom.ts";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { createDomSource } from "./dom-source.ts";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";
import { flatten, folders, lineOf, pathOf, search } from "./dom-lines.ts";
import { ROW, Row } from "./dom-row.tsx";
import { DomMenu, type DomTarget } from "./dom-menu.tsx";
import { Status } from "./dom-status.tsx";

/** The editor's view: its status and its content's DOM, mapped to the document. Mounted per editor. */
export const Dom = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createDomSource(store.transport, editorId));
  const { info, error } = useStore(source.state);
  const [collapsed, setCollapsedState] = useState<ReadonlySet<string>>(() => new Set());
  // Also read by a reveal, which runs outside a render.
  const collapsedNow = useRef(collapsed);
  const setCollapsed = useCallback((next: ReadonlySet<string>) => {
    collapsedNow.current = next;
    setCollapsedState(next);
  }, []);
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null);
  // State: the rows are read from it when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const lines = info ? flatten(info.dom, collapsed) : [];

  const { indices, height } = useRows(scrollElement, lines.length, ROW);

  const element = (id: string, action: "outline" | "log" | "logHTML") =>
    source.element(pathOf(id), action);

  const hide = source.hideOutline;

  // A clicked element is outlined in the page until another is clicked, or the tab or editor changes.
  const select = useCallback(
    (id: string) => {
      setFocused(id);
      void source.element(pathOf(id), "outline");
    },
    [source]
  );

  // A line opened up to, selected and scrolled to. Stable: the tree's ref callback uses it, and would
  // subscribe again on a new one.
  const showLine = useCallback(
    (dom: ViewNode, id: string, scroller: HTMLElement | null) => {
      const next = new Set(collapsedNow.current);
      const parts = id ? id.split(".") : [];
      for (let depth = 0; depth < parts.length; depth++)
        next.delete(parts.slice(0, depth).join("."));
      setCollapsed(next);
      select(id);
      centreRow(
        scroller,
        flatten(dom, next).findIndex((line) => line.id == id),
        ROW
      );
    },
    [setCollapsed, select]
  );

  const find = info ? (query: string) => search(info.dom, query) : null;
  const searching = useSearch(find, (id) => info && showLine(info.dom, id, scrollElement));

  const toggle = (id: string) => {
    const closing = !collapsed.has(id);
    const next = new Set(collapsedNow.current);
    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    if (closing && focused != null && focused.startsWith(id ? `${id}.` : "") && focused != id)
      setFocused(id);
  };

  // Loads while its tab is shown: on showing (when the editor updated meanwhile) and on each update.
  const container = useCallback(
    (scroller: HTMLDivElement | null) => {
      setScrollElement(scroller);
      if (!scroller) return;
      const shown = () => store.state.get().tab == "dom";
      let stale = true;
      const load = () => {
        stale = false;
        void source.load();
      };
      const stopState = store.onStateChanged((id) => {
        if (id != editorId) return;
        if (shown()) load();
        else stale = true;
      });
      const stopStore = store.state.listen(() => {
        if (!shown()) hide();
        else if (stale) load();
      });
      // A "show in DOM" from the Structure: its element (or nearest ancestor's) opened up to, selected and scrolled to.
      const reveal = (path: Path) => {
        const info = source.state.get().info;
        if (info) showLine(info.dom, lineOf(info.dom, path), scroller);
      };
      const takeReveal = () => {
        if (!shown()) return;
        const path = store.takeDomReveal(editorId);
        if (path) void source.load().then(() => reveal(path));
      };
      const stopReveal = store.onReveal(takeReveal);
      if (shown()) load();
      takeReveal();
      return () => {
        stopState();
        stopStore();
        stopReveal();
        hide();
      };
    },
    [store, editorId, source, hide, showLine]
  );

  const focusLine = (position: number) => {
    const line = lines[Math.max(0, Math.min(lines.length - 1, position))];
    if (!line) return;
    select(line.id);
    keepRowInView(scrollElement, lines.indexOf(line), ROW);
  };

  // The line a menu opens on is selected (and outlined).
  const [menu] = useState(() =>
    createMenuAnchor<DomTarget>(
      "[data-dom]",
      (row) => ({ id: row.getAttribute("data-dom") ?? "" }),
      (_, target) => select(target.id)
    )
  );

  // As in a tree: Right opens a closed element or goes to its first child; Left closes or goes to the parent.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const position = lines.findIndex((line) => line.id == focused);
    const line = lines[position];
    const moves: Partial<Record<string, number>> = {
      ArrowDown: position + 1,
      ArrowUp: position - 1,
      Home: 0,
      End: lines.length - 1,
    };
    const target = moves[event.key];
    const folder = line != null && line.node.children.length > 0;
    if (target != null) {
      event.preventDefault();
      focusLine(target);
    } else if (line && folder && event.key == "ArrowRight") {
      event.preventDefault();
      if (line.collapsed) toggle(line.id);
      else focusLine(position + 1);
    } else if (line && event.key == "ArrowLeft") {
      event.preventDefault();
      if (folder && !line.collapsed) toggle(line.id);
      else if (line.id)
        focusLine(lines.findIndex((other) => other.id == line.id.replace(/\.?\d+$/, "")));
    }
  };

  const active = indices.some((index) => lines[index]?.id == focused) ? focused : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the DOM: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      {info && <Status status={info.status} />}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 text-xs">
        <SearchBox
          search={searching}
          label="Search the DOM"
          placeholder="Search text, tags, attributes, node names"
        />
        <Tip label="The content's DOM, each element with the node it draws">
          <button
            type="button"
            aria-label="About the DOM"
            className="flex text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            <InformationCircleIcon />
          </button>
        </Tip>
        <span className="flex items-center gap-1">
          <Tip label="Clear the selection and its outline in the page">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear the selection"
              disabled={focused == null}
              onClick={() => {
                setFocused(null);
                hide();
              }}
            >
              <NoSymbolIcon />
            </Button>
          </Tip>
          <Tip label="Log the selected element to the page's console">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Log to the console"
              onClick={() => void element(focused ?? "", "log")}
            >
              <CommandLineIcon />
            </Button>
          </Tip>
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
              // The content element stays open: its blocks show.
              onClick={() => {
                setCollapsed(new Set(info ? folders(info.dom).filter((id) => id != "") : []));
                if (focused) setFocused(focused.split(".")[0] ?? "");
              }}
            >
              <ChevronDownUpIcon />
            </Button>
          </Tip>
        </span>
      </div>
      <div
        ref={container}
        role="tree"
        aria-label="DOM"
        tabIndex={0}
        aria-activedescendant={active == null ? undefined : `view-${active || "root"}`}
        onKeyDown={onKeyDown}
        onContextMenu={menu.onContextMenu}
        onClick={(event) => {
          const id =
            event.target instanceof Element
              ? event.target.closest("[data-dom]")?.getAttribute("data-dom")
              : null;
          if (id != null) select(id);
        }}
        className="relative min-h-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div style={{ height }}>
          {indices.map((index) => {
            const line = lines[index];
            return (
              line && (
                <Row
                  key={line.id}
                  line={line}
                  start={index * ROW}
                  focused={line.id == focused}
                  match={matchClass(line.id, searching)}
                  onToggle={toggle}
                />
              )
            );
          })}
        </div>
      </div>
      <DomMenu
        store={store}
        editorId={editorId}
        dom={info?.dom ?? null}
        anchor={menu}
        tree={scrollElement}
        onElement={(id, action) => void element(id, action)}
      />
    </div>
  );
};
