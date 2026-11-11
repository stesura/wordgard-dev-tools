import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import { useCallback, useState, type KeyboardEvent } from "react";
import { whileShown } from "#stores/while-shown.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { LoadError } from "#components/load-error";
import { ExpandCollapse } from "#components/expand-collapse";
import { SearchBox, matchClass, searchStrip, useSearch, searchRest } from "#components/search-box";
import { IconButton } from "#components/icon-button";
import { SplitPane, type SplitKind } from "#components/split-pane";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";
import { centreRow } from "#lib/dom.ts";
import { createMenuAnchor } from "#lib/menu-anchor.ts";
import { asJSON, persistent } from "#stores/persistent.ts";
import { KeyboardIcon, PlusCircleIcon } from "#icons";
import { Tip } from "#components/tip";
import { GuidePopover } from "#components/guide-popover";
import { EXTENSIONS_TREE } from "../../guides/guides.ts";
import { fire } from "../../transport.ts";
import { Button } from "#components/ui/button";
import {
  ancestorsOf,
  facetsIdOf,
  facetsTree,
  folders,
  linesOf,
  nodeAt,
  pathOfId,
  search,
} from "./extension-tree.ts";
import { ExtensionMenu, type ExtensionTarget } from "./extension-menu.tsx";
import { ExtensionPane, ROW, Row } from "./extension-views.tsx";
import { createExtensionsSource } from "./extensions-source.ts";
import { createKeymapSource } from "./keymap-source.ts";
import { KeymapPane } from "./keymap-pane.tsx";

// The extensions | the key bindings: on the right when the tab is wide, under it below that.
const KEYS_SPLIT: SplitKind = {
  key: "wordgard-devtools:keys-pane",
  wide: 1024,
  defaults: { horizontal: 440, vertical: 240 },
  min: { horizontal: 280, vertical: 100 },
};

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
  // The key bindings' pane. Saved, shared by every editor's tab; read when the configuration changes.
  const [keysOpenAtom] = useState(() =>
    persistent(
      "wordgard-devtools:key-bindings",
      false,
      asJSON((json) => json === true)
    )
  );
  const keysOpen = useStore(keysOpenAtom);
  const [keysButton, setKeysButton] = useState<HTMLButtonElement | null>(null);
  const [keymapSource] = useState(() => createKeymapSource(store.transport, editorId));
  const { value: keymap, error: keymapError } = useStore(keymapSource.state);
  // "By facet": the facets, each with its values in Wordgard's order. Saved, shared by every editor.
  const [byFacetAtom] = useState(() =>
    persistent(
      "wordgard-devtools:extensions-by-facet",
      false,
      asJSON((json) => json === true)
    )
  );
  const byFacet = useStore(byFacetAtom);
  // The selected extension's pane. Saved, shared by every editor's tab.
  const [paneOpenAtom] = useState(() =>
    persistent(
      "wordgard-devtools:extension-pane",
      true,
      asJSON((json) => json !== false)
    )
  );
  const paneOpen = useStore(paneOpenAtom);
  const [paneButton, setPaneButton] = useState<HTMLButtonElement | null>(null);
  const facets = info && byFacet ? facetsTree(info) : null;
  // The rows shown: the tree, or the facets view, whose rows stand for the tree's.
  const root = facets?.root ?? info?.root ?? null;
  const lines = root ? linesOf(root, collapsed) : [];
  const { indices, height } = useRows(scrollElement, lines.length, ROW);

  // A shown row's id in the tree. Read from the atoms: the menu's anchor keeps its first render's
  // `select`.
  const realId = (id: string | null) => {
    const loaded = source.tree.state.get().value;
    if (id == null || !loaded) return null;
    const real = byFacetAtom.get() ? facetsTree(loaded).real.get(id) : id;
    return real != null && nodeAt(loaded.root, real) ? real : null;
  };
  const select = (id: string | null) => {
    selection.set(id);
    const real = realId(id);
    const tree = source.tree.state.get().value?.root;
    const node = real == null || !tree ? null : (nodeAt(tree, real) ?? null);
    void source.loadRow(node ? real : null, node?.source ?? null);
  };
  // The row a context menu opens on is selected.
  const [menu] = useState(() =>
    createMenuAnchor<ExtensionTarget>(
      "[data-extension]",
      (row) => ({ id: row.getAttribute("data-extension") ?? "" }),
      (_, target) => select(target.id)
    )
  );
  // The pane's: the same items, on the extension it shows.
  const [paneMenu] = useState(() =>
    createMenuAnchor<ExtensionTarget>(
      "[data-extension-detail]",
      (element) => ({ id: element.getAttribute("data-extension-detail") ?? "" }),
      () => {}
    )
  );

  // The tree and the key bindings reload on each reconfigure; the selected row's values on each
  // state change. Shown from the Log, the tree takes focus.
  const container = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return;
      const stopTree = whileShown(store, {
        tab: "extensions",
        editorId,
        on: "config",
        load: () => {
          // By facet, the selection is a facet's place in a sorted list, which a reconfigure can
          // shift: it follows its row in the tree instead.
          const before = source.tree.state.get().value;
          const id = selection.get();
          const real =
            byFacetAtom.get() && before && id != null ? facetsTree(before).real.get(id) : undefined;
          void source.tree.load().then(() => {
            const loaded = source.tree.state.get().value;
            if (real == null || !loaded || !byFacetAtom.get() || selection.get() != id) return;
            const shown = facetsIdOf(facetsTree(loaded), real);
            selection.set(shown);
            const node = shown == null ? undefined : nodeAt(loaded.root, real);
            void source.loadRow(node ? real : null, node?.source ?? null);
          });
          if (keysOpenAtom.get()) void keymapSource.load();
        },
        reconnect: true,
        onReveal: () => {
          if (!store.takeExtensionsReveal(editorId)) return;
          requestAnimationFrame(() => element.querySelector<HTMLElement>("[role='tree']")?.focus());
        },
      });
      const stopRow = whileShown(store, {
        tab: "extensions",
        editorId,
        on: "state",
        load: () => {
          if (selection.get() == null) return;
          void source.tree.ready().then(() => {
            const loaded = source.tree.state.get().value;
            const id = selection.get();
            const real =
              id == null || !loaded
                ? null
                : byFacetAtom.get()
                  ? facetsTree(loaded).real.get(id)
                  : id;
            const node = real != null && loaded ? nodeAt(loaded.root, real) : undefined;
            void source.loadRow(node && real != null ? real : null, node?.source ?? null);
          });
        },
      });
      return () => {
        stopTree();
        stopRow();
      };
    },
    [store, editorId, source, selection, keysOpenAtom, keymapSource, byFacetAtom]
  );

  // Closed from inside the pane, focus goes to its button: the pane's controls go with it.
  const setKeysOpen = (open: boolean, refocus = false) => {
    keysOpenAtom.set(open);
    if (open) void keymapSource.load();
    if (refocus) keysButton?.focus();
  };
  const setPaneOpen = (open: boolean, refocus = false) => {
    paneOpenAtom.set(open);
    if (refocus) paneButton?.focus();
  };
  // By the row's id in the tree.
  const logExtension = (id: string, resolved: boolean) =>
    fire(store.transport, { type: "logExtension", id: editorId, path: pathOfId(id), resolved });
  const logKeyBinding = (index: number, shift: boolean) =>
    fire(store.transport, { type: "logKeyBinding", id: editorId, index, shift });

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
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
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
    } else if (event.key == "Escape" && selected != null) {
      event.preventDefault();
      select(null);
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

  // A row of the tree, in the view shown.
  const showRow = (id: string) => {
    const shown = facets ? facetsIdOf(facets, id) : id;
    if (shown != null) reveal(shown);
  };
  // Rows open again on switching; the selected row follows when the other view has it.
  const setByFacet = (on: boolean) => {
    const real = realId(selection.get());
    byFacetAtom.set(on);
    setCollapsed(new Set());
    const shown = real == null || !info ? null : on ? facetsIdOf(facetsTree(info), real) : real;
    select(shown);
  };

  const active = indices.some((index) => lines[index]?.id == selected) ? selected : null;
  const selectedReal =
    selected == null ? null : facets ? (facets.real.get(selected) ?? null) : selected;
  const node = info && selectedReal != null ? (nodeAt(info.root, selectedReal) ?? null) : null;

  const extensions = (
    <SplitPane
      pane={
        paneOpen ? (
          <ExtensionPane
            id={node ? selectedReal : null}
            node={node}
            values={
              values.id == selectedReal
                ? values
                : { ...values, values: null, output: null, error: null }
            }
            facets={info?.facets ?? []}
            capped={info?.capped ?? false}
            menu={paneMenu}
            onShowNode={(path) => store.showNode(editorId, path, { decorations: true })}
            onShowRow={showRow}
            onClose={() => setPaneOpen(false, true)}
          />
        ) : null
      }
    >
      <LoadError what="the extensions" error={error} onRetry={() => void source.tree.load()} />
      <div className={searchStrip}>
        <h3 className="shrink-0 font-medium">Extensions</h3>
        <GuidePopover guide={EXTENSIONS_TREE} label="About the extensions" align="start" />
        <SearchBox
          search={searching}
          label="Search the extensions"
          placeholder="Search names and values"
        />
        <span className={searchRest}>
          {info && (
            <span className="shrink-0 text-muted-foreground">
              {facets
                ? `${info.facets.length} facet${info.facets.length == 1 ? "" : "s"}`
                : `${info.count} extension${info.count == 1 ? "" : "s"}`}
              {info.capped && ", some left out"}
            </span>
          )}
          <Tip label="Each facet, with its values in the order Wordgard gives them">
            <Button
              variant={byFacet ? "secondary" : "ghost"}
              size="xs"
              aria-pressed={byFacet}
              onClick={() => setByFacet(!byFacet)}
            >
              By facet
            </Button>
          </Tip>
          <ExpandCollapse
            onExpand={() => setCollapsed(new Set())}
            onCollapse={() => {
              if (!root) return;
              setCollapsed(new Set(folders(root)));
              if (selected != null) select(selected.split(".")[0] ?? null);
            }}
          />
          <IconButton
            ref={setPaneButton}
            label="Extension details"
            pressed={paneOpen}
            onClick={() => setPaneOpen(!paneOpen)}
          >
            <PlusCircleIcon />
          </IconButton>
          <IconButton
            ref={setKeysButton}
            label="Key bindings"
            pressed={keysOpen}
            onClick={() => setKeysOpen(!keysOpen)}
          >
            <KeyboardIcon />
          </IconButton>
        </span>
      </div>
      <div
        ref={setScrollElement}
        role="tree"
        aria-label="Extensions"
        tabIndex={0}
        aria-activedescendant={active == null ? undefined : `extension-${active}`}
        onKeyDown={onKeyDown}
        onContextMenu={menu.onContextMenu}
        onClick={(event) => {
          const id =
            event.target instanceof Element
              ? event.target.closest("[data-extension]")?.getAttribute("data-extension")
              : null;
          if (id != null) select(id);
        }}
        onDoubleClick={(event) => {
          const id =
            event.target instanceof Element
              ? event.target.closest("[data-extension]")?.getAttribute("data-extension")
              : null;
          if (id == null) return;
          if (id != selection.get()) select(id);
          setPaneOpen(true);
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
  );
  // The tree's menu is on shown rows; the pane's, on the tree's.
  const nodeOf = (id: string) => (info && nodeAt(info.root, id)) ?? null;
  const shownNodeOf = (id: string) => {
    const real = facets ? facets.real.get(id) : id;
    return real == null ? null : nodeOf(real);
  };
  const logShown = (id: string, resolved: boolean) => {
    const real = facets ? facets.real.get(id) : id;
    if (real != null) logExtension(real, resolved);
  };
  const showField = (index: number) => store.showField(editorId, index);

  // Each panel has its own header bar: the tree's toolbar, the pane's, the key bindings'.
  return (
    <div ref={container} className="flex min-h-0 flex-1 flex-col">
      <SplitPane
        kind={KEYS_SPLIT}
        pane={
          keysOpen ? (
            <KeymapPane
              keymap={keymap}
              error={keymapError}
              onRetry={() => void keymapSource.load()}
              onLog={logKeyBinding}
              onClose={() => setKeysOpen(false, true)}
            />
          ) : null
        }
      >
        {extensions}
      </SplitPane>
      <ExtensionMenu
        anchor={menu}
        nodeOf={shownNodeOf}
        focusBack={scrollElement}
        onLog={logShown}
        onShowField={showField}
      />
      <ExtensionMenu
        anchor={paneMenu}
        nodeOf={nodeOf}
        focusBack={null}
        onLog={logExtension}
        onShowField={showField}
      />
    </div>
  );
};
