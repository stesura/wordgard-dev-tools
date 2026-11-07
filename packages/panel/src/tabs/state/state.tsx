import { createOutline } from "#lib/outline.ts";
import { whileShown } from "#stores/while-shown.ts";
import { ExpandCollapse } from "#components/expand-collapse";
import { IconButton } from "#components/icon-button";
import { LoadError } from "#components/load-error";
import { fire } from "../../transport.ts";
import { useStore } from "@nanostores/react";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CodeBracketIcon, CommandLineIcon } from "#icons";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import type { Path } from "@stesura/wordgard-dev-tools";
import { CopyButton } from "#components/copy-button";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import { SearchBox, searchStrip, matchClass, useSearch } from "#components/search-box";
import { centreRow } from "#lib/dom.ts";
import { createStateSource } from "./state-source.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";
import { download, fileName, replaceFrom } from "./state-file.ts";
import { CLOSING_MS, NoticeBar, type Notice } from "#components/notice-bar";
import { type Line, ROOT, childOf, containers, flatten, keysOf, search } from "./json-lines.ts";
import { copy } from "#lib/clipboard.ts";
import { selectedText } from "#lib/selected-text.ts";
import { ROW, Row } from "./state-row.tsx";
import { type MenuTarget, StateMenu } from "./state-menu.tsx";

/** The editor's state as plain JSON (`GardState.toJSON`), collapsible and virtualized. Mounted per editor. */
export const State = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createStateSource(store.transport, editorId));
  const { value: json, error } = useStore(source.state);
  // The state is an object: null until the first load.
  const loaded = json != null;

  // The outcome of a replace: shown until closed, replaced, or the tab or editor changes. Its close
  // eases out on a timer, not transitionend: that doesn't fire with reduced motion.
  const [notice, setNotice] = useState<Notice | null>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = (next: Notice) => {
    clearTimeout(closingTimer.current);
    setNotice(next);
  };
  // Focus goes to the tree: the button it was on goes.
  const closeNotice = () => {
    clearTimeout(closingTimer.current);
    setNotice((shown) => shown && { ...shown, closing: true });
    closingTimer.current = setTimeout(() => setNotice(null), CLOSING_MS);
    scrollElement?.focus();
  };
  const editorName = () =>
    store.state.get().editors.find((editor) => editor.id == editorId)?.name ?? "editor";

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null);
  // State: the rows are read from it when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const lines = loaded ? flatten(json, collapsed) : [];

  const { indices, height } = useRows(scrollElement, lines.length, ROW);

  // A node highlighted from the menu stays outlined in the page until a line is clicked, the
  // document changes, or the tab or editor does.
  const [outline] = useState(() => createOutline(store.transport, editorId));
  const highlight = (path: Path) => {
    outline.show(path);
    fire(store.transport, { type: "scrollIntoView", id: editorId, path });
  };

  // The line a context menu opens on takes focus.
  const [menu] = useState(() =>
    createMenuAnchor<MenuTarget>(
      "[data-line]",
      (row) => ({ keys: keysOf(row.getAttribute("data-line") ?? ROOT) }),
      (row) => setFocused(row.getAttribute("data-line"))
    )
  );

  // Closing an object that holds the focused line moves focus to it.
  const toggle = (id: string) => {
    const closing = !collapsed.has(id);
    setCollapsed((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    if (closing && focused != null && (focused.startsWith(`${id}/`) || focused == `${id}#`))
      setFocused(id);
  };

  // Everything but the root closes: focus goes to the root's entry that held it.
  const collapseAll = () => {
    setCollapsed(new Set(containers(json).filter((id) => id != ROOT)));
    if (focused != null && focused != ROOT)
      setFocused(focused.replace(/#$/, "").split("/").slice(0, 2).join("/"));
  };

  // Loads while its tab is shown: on showing (when the state changed meanwhile) and on each change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollElement(element);
      if (!element) return;
      const stop = whileShown(store, {
        tab: "state",
        editorId,
        on: "state",
        load: () => void source.load(),
        // The tabs stay mounted: the banner would wait for the tab's return.
        onHide: () => {
          outline.hide();
          clearTimeout(closingTimer.current);
          setNotice(null);
        },
      });
      // The outline follows a path: after an edit it could be another node's.
      const stopDoc = store.on("doc", (id) => {
        if (id == editorId) outline.hide();
      });
      return () => {
        outline.hide();
        stop();
        stopDoc();
      };
    },
    [store, editorId, source, outline]
  );

  const focusLine = (position: number) => {
    const line = lines[Math.max(0, Math.min(lines.length - 1, position))];
    if (!line) return;
    setFocused(line.id);
    keepRowInView(scrollElement, lines.indexOf(line), ROW);
  };

  // As in a tree: Right opens a closed object, Left closes an open one or goes to its parent.
  const onKeyDown = (event: KeyboardEvent) => {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    // Select all: the root, so the whole tree, not the page. Copy: what's selected, as JSON, unless
    // text is selected in the tree (the browser copies that).
    const shortcut = (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase();
    if (shortcut == "a") {
      event.preventDefault();
      document.getSelection()?.removeAllRanges();
      setFocused(ROOT);
      return;
    }
    if (shortcut == "c" && focused != null && !selectedText(event.currentTarget)) {
      event.preventDefault();
      void copy(
        JSON.stringify(keysOf(focused).reduce<unknown>(childOf, json), null, 2) ?? "undefined"
      );
      return;
    }
    const position = lines.findIndex((line) => line.id == focused);
    const line = lines[position];
    const moves: Partial<Record<string, number>> = {
      ArrowDown: position + 1,
      ArrowUp: position - 1,
      Home: 0,
      End: lines.length - 1,
    };
    const target = moves[event.key];
    if (target != null) {
      event.preventDefault();
      focusLine(target);
    } else if (line && event.key == "ArrowRight" && line.kind == "open" && line.size > 0) {
      // Opens a closed object; in an open one, goes to its first entry.
      event.preventDefault();
      if (line.collapsed) toggle(line.id);
      else focusLine(position + 1);
    } else if (line && event.key == "ArrowLeft") {
      event.preventDefault();
      if (line.kind == "open" && line.size > 0 && !line.collapsed) toggle(line.id);
      else if (line.id != ROOT) {
        // A closing line goes to its opening, others to their parent.
        const target =
          line.kind == "close" ? line.id.slice(0, -1) : line.id.replace(/\/[^/]*$/, "");
        focusLine(lines.findIndex((other) => other.id == target));
      }
    }
  };

  // A match opens the objects holding it, takes focus and scrolls into view.
  const reveal = (id: string) => {
    const parts = id.split("/");
    const ancestors = parts.slice(1).map((_, depth) => parts.slice(0, depth + 1).join("/"));
    const next = new Set([...collapsed].filter((other) => !ancestors.includes(other)));
    setCollapsed(next);
    setFocused(id);
    centreRow(
      scrollElement,
      flatten(json, next).findIndex((line) => line.id == id),
      ROW
    );
  };
  const find = loaded ? (query: string) => search(json, query) : null;
  const searching = useSearch(find, reveal);

  const active = indices.some((index) => lines[index]?.id == focused) ? focused : null;
  // A focused bracket selects its whole object or array, from its opening to its closing.
  const focusedLine = lines.find((line) => line.id == focused);
  const range =
    focusedLine && focusedLine.kind != "value" ? focusedLine.id.replace(/#$/, "") : null;
  const selected = (line: Line) =>
    range == null
      ? line.id == focused
      : line.id == range || line.id == `${range}#` || line.id.startsWith(`${range}/`);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LoadError what="the state" error={error} onRetry={() => void source.load()} />
      <div className={searchStrip}>
        <h3 className="shrink-0 font-medium">State</h3>
        <SearchBox
          search={searching}
          label="Search the state"
          placeholder="Search keys and values"
        />

        <span className="flex items-center gap-1">
          <ExpandCollapse
            onExpand={() => setCollapsed(new Set())}
            // The root stays open: its keys show.
            onCollapse={collapseAll}
          />
          <IconButton
            label="Log the state to the console"
            onClick={() => fire(store.transport, { type: "logState", id: editorId, keys: [] })}
          >
            <CommandLineIcon />
          </IconButton>
          <IconButton
            label="Log the state's JSON to the console"
            onClick={() =>
              fire(store.transport, { type: "logState", id: editorId, keys: [], json: true })
            }
          >
            <CodeBracketIcon />
          </IconButton>
          <CopyButton label="Copy the JSON" text={() => JSON.stringify(json, null, 2)} />
          <IconButton
            label="Download the state as a JSON file"
            disabled={!loaded}
            onClick={() => download(json, fileName(editorName()))}
          >
            <ArrowDownTrayIcon />
          </IconButton>
          <IconButton
            label="Replace the state from a JSON file"
            render={<label />}
            nativeButton={false}
          >
            <ArrowUpTrayIcon />
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // The same file can be picked again.
                event.target.value = "";
                if (file) void replaceFrom(store, editorId, file, notify);
              }}
            />
          </IconButton>
        </span>
      </div>
      <NoticeBar notice={notice} onClose={closeNotice} />
      <div
        ref={container}
        role="tree"
        aria-label="State"
        tabIndex={0}
        aria-activedescendant={active == null ? undefined : `state-${active}`}
        onKeyDown={onKeyDown}
        onContextMenu={menu.onContextMenu}
        onClick={(event) => {
          const id =
            event.target instanceof Element
              ? event.target.closest("[data-line]")?.getAttribute("data-line")
              : null;
          if (id != null) setFocused(id);
          outline.hide();
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
                  selected={selected(line)}
                  focused={line.id == focused}
                  match={matchClass(line.id, searching)}
                  onToggle={toggle}
                />
              )
            );
          })}
        </div>
      </div>
      <StateMenu
        store={store}
        editorId={editorId}
        json={json}
        anchor={menu}
        tree={scrollElement}
        onHighlight={highlight}
      />
    </div>
  );
};
