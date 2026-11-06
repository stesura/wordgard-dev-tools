import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import { useCallback, useState, type KeyboardEvent } from "react";
import { whileShown } from "#stores/while-shown.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { LoadError } from "#components/load-error";
import { ExpandCollapse } from "#components/expand-collapse";
import { SearchBox, matchClass, searchStrip, useSearch } from "#components/search-box";
import { SplitPane } from "#components/split-pane";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";
import { centreRow } from "#lib/dom.ts";
import { fire } from "../../transport.ts";
import { ancestorsOf, folders, linesOf, nodeAt, pathOfId, search } from "./extension-tree.ts";
import { ExtensionPane, ROW, Row } from "./extension-views.tsx";
import { createExtensionsSource } from "./extensions-source.ts";

/** The editor's configuration as a tree of extensions. Mounted per editor. */
export const Extensions = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createExtensionsSource(store.transport, editorId));
  const { value: info, error } = useStore(source.tree.state);
  const values = useStore(source.row);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // An atom: read when the state changes, outside a render.
  const [selection] = useState(() => atom<string | null>(null));
  const selected = useStore(selection);
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const root = info?.root ?? null;
  const lines = root ? linesOf(root, collapsed) : [];
  const { indices, height } = useRows(scrollElement, lines.length, ROW);

  const loadRow = (id: string | null) => {
    const node = id == null ? null : (root && nodeAt(root, id)) || null;
    void source.loadRow(node ? id : null, node?.source ?? null);
  };
  const select = (id: string | null) => {
    selection.set(id);
    loadRow(id);
  };

  // The tree reloads on each reconfigure; the selected row's values on each state change.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      setScrollElement(element);
      if (!element) return;
      const stopTree = whileShown(store, {
        tab: "extensions",
        editorId,
        on: "config",
        load: () => void source.tree.load(),
        reconnect: true,
      });
      const stopRow = whileShown(store, {
        tab: "extensions",
        editorId,
        on: "state",
        load: () => {
          const id = selection.get();
          if (id == null) return;
          void source.tree.ready().then(() => {
            const tree = source.tree.state.get().value?.root;
            const node = tree ? nodeAt(tree, id) : undefined;
            void source.loadRow(node ? id : null, node?.source ?? null);
          });
        },
      });
      return () => {
        stopTree();
        stopRow();
      };
    },
    [store, editorId, source, selection]
  );

  const toggle = (id: string) => {
    const closing = !collapsed.has(id);
    setCollapsed((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    if (closing && selected != null && selected.startsWith(`${id}.`)) select(id);
  };

  const focusLine = (position: number) => {
    const line = lines[Math.max(0, Math.min(lines.length - 1, position))];
    if (!line) return;
    select(line.id);
    keepRowInView(scrollElement, lines.indexOf(line), ROW);
  };

  // As in a tree: Right opens a closed row or goes to its first child, Left closes or goes up.
  const onKeyDown = (event: KeyboardEvent) => {
    const position = lines.findIndex((line) => line.id == selected);
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
    } else if (line && event.key == "ArrowRight" && line.node.children.length) {
      event.preventDefault();
      if (line.collapsed) toggle(line.id);
      else focusLine(position + 1);
    } else if (line && event.key == "ArrowLeft") {
      event.preventDefault();
      if (line.node.children.length && !line.collapsed) toggle(line.id);
      else {
        const parent = ancestorsOf(line.id).at(-1);
        if (parent != null) focusLine(lines.findIndex((other) => other.id == parent));
      }
    }
  };

  // A match opens the rows holding it, is selected and scrolled to.
  const reveal = (id: string) => {
    const ancestors = ancestorsOf(id);
    const next = new Set([...collapsed].filter((other) => !ancestors.includes(other)));
    setCollapsed(next);
    select(id);
    if (root)
      centreRow(
        scrollElement,
        linesOf(root, next).findIndex((line) => line.id == id),
        ROW
      );
  };
  const find = root ? (query: string) => search(root, query) : null;
  const searching = useSearch(find, reveal);

  const active = indices.some((index) => lines[index]?.id == selected) ? selected : null;
  const node = root && selected != null ? (nodeAt(root, selected) ?? null) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <LoadError what="the extensions" error={error} onRetry={() => void source.tree.load()} />
      <div className={searchStrip}>
        <SearchBox
          search={searching}
          label="Search the extensions"
          placeholder="Search names and values"
        />
        {info && (
          <span className="shrink-0 text-muted-foreground">
            {info.count} extension{info.count == 1 ? "" : "s"}
            {info.capped && ", some left out"}
          </span>
        )}
        <span className="flex items-center gap-1">
          <ExpandCollapse
            onExpand={() => setCollapsed(new Set())}
            onCollapse={() => {
              if (!root) return;
              setCollapsed(new Set(folders(root)));
              if (selected != null) select(selected.split(".")[0] ?? null);
            }}
          />
        </span>
      </div>
      <SplitPane
        pane={
          <ExtensionPane
            node={node}
            values={
              values.id == selected
                ? values
                : { ...values, values: null, output: null, error: null }
            }
            onLog={(resolved) => {
              if (selected == null) return;
              fire(store.transport, {
                type: "logExtension",
                id: editorId,
                path: pathOfId(selected),
                resolved,
              });
            }}
            onShowField={(index) => store.showField(editorId, index)}
            onShowNode={(path) => store.showNode(editorId, path, { decorations: true })}
          />
        }
      >
        <div
          ref={container}
          role="tree"
          aria-label="Extensions"
          tabIndex={0}
          aria-activedescendant={active == null ? undefined : `extension-${active}`}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            const id =
              event.target instanceof Element
                ? event.target.closest("[data-extension]")?.getAttribute("data-extension")
                : null;
            if (id != null) select(id);
          }}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    selected={line.id == selected}
                    match={matchClass(line.id, searching)}
                    onToggle={toggle}
                  />
                )
              );
            })}
          </div>
        </div>
      </SplitPane>
    </div>
  );
};
