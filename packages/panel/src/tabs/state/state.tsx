import { cn } from "cn";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  ChevronDownIcon,
  ChevronDownUpIcon,
  ChevronRightIcon,
  ChevronUpDownIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  InformationCircleIcon,
  MapPinIcon,
  RectangleGroupIcon,
  ViewfinderCircleIcon,
} from "#icons";
import { useCallback, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { accessor, type Path } from "@stesura/wordgard-dev-tools";
import { Button } from "#components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import { CopyButton } from "#components/copy-button";
import { CopySelection, copy, createMenuAnchor, type MenuAnchor } from "#components/node-menu";
import { SearchBox, centreRow, includes, matchClass, useSearch } from "#components/search-box";
import { createStateSource } from "./state-source.ts";
import type { PanelStore } from "#stores/panel-store.ts";
import { Tip } from "#components/tip";
import { keepRowInView, useRows } from "#hooks/use-rows.ts";

const ROW = 20;

/** A file name from the editor's: letters, digits, dashes. */
const fileName = (editor: string) =>
  `wordgard-state-${editor.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "editor"}.json`;

/** Saves the JSON as a file, through a link. */
const download = (json: unknown, name: string) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(json, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url));
};

type Notice = { ok: boolean; text: string; closing?: boolean };

// The banner's close: its height eases to nothing, then it unmounts.
const SHOWN_MS = 5000;
const CLOSING_MS = 300;
const INDENT = 14;
const ROOT = "$";

/** One line of the JSON: a value, an object's or array's opening (or the whole of it, collapsed), or its closing. */
type Line = {
  /** The key path from the root (`$/doc/content/0`, keys URI-encoded so a "/" in one can't split it); a closing line adds `#`. */
  id: string;
  depth: number;
  key: string | null;
  kind: "value" | "open" | "close";
  /** A value's JSON, or the brackets. */
  text: string;
  /** Opening lines: the number of entries. */
  size: number;
  type: "string" | "number" | "boolean" | "null" | "bracket";
  /** An opening shown closed, its entries hidden. */
  collapsed: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value == "object" && value != null && !Array.isArray(value);

const typeOf = (value: unknown): Line["type"] =>
  typeof value == "string"
    ? "string"
    : typeof value == "number"
      ? "number"
      : typeof value == "boolean"
        ? "boolean"
        : "null";

/** Ids of every object and array: what "collapse all" closes. */
const containers = (value: unknown, id = ROOT, out: string[] = []) => {
  const entries = Array.isArray(value)
    ? value.entries()
    : isRecord(value)
      ? Object.entries(value)
      : null;
  if (!entries) return out;
  out.push(id);
  for (const [key, child] of entries) containers(child, childId(id, key), out);
  return out;
};

const childId = (id: string, key: string | number) => `${id}/${encodeURIComponent(key)}`;

/** A line's keys from the root; a closing line's are its object's. */
const keysOf = (id: string) => id.replace(/#$/, "").split("/").slice(1).map(decodeURIComponent);

/** A node object's path in the document (`doc`, then `content` and an index, down), or null for other values. */
const nodePathOf = (keys: string[]): Path | null => {
  if (keys[0] != "doc") return null;
  const path: number[] = [];
  for (let i = 1; i < keys.length; i += 2) {
    const index = Number(keys[i + 1]);
    if (keys[i] != "content" || !Number.isInteger(index)) return null;
    path.push(index);
  }
  return path;
};

const childOf = (value: unknown, key: string): unknown =>
  Array.isArray(value) ? value[Number(key)] : isRecord(value) ? value[key] : undefined;

const flatten = (value: unknown, collapsed: ReadonlySet<string>) => {
  const lines: Line[] = [];
  const walk = (value: unknown, id: string, depth: number, key: string | null) => {
    const array = Array.isArray(value);
    const entries: [string | number, unknown][] | null = array
      ? [...value.entries()]
      : isRecord(value)
        ? Object.entries(value)
        : null;
    if (!entries) {
      lines.push({
        id,
        depth,
        key,
        kind: "value",
        text: JSON.stringify(value) ?? String(value),
        size: 0,
        type: typeOf(value),
        collapsed: false,
      });
      return;
    }
    const [open, close] = array ? ["[", "]"] : ["{", "}"];
    const shut = collapsed.has(id) && entries.length > 0;
    lines.push({
      id,
      depth,
      key,
      kind: "open",
      text: entries.length == 0 ? open + close : shut ? `${open} … ${close}` : open,
      size: entries.length,
      type: "bracket",
      collapsed: shut,
    });
    if (shut || entries.length == 0) return;
    for (const [k, child] of entries)
      walk(child, childId(id, k), depth + 1, array ? null : String(k));
    lines.push({
      id: `${id}#`,
      depth,
      key: null,
      kind: "close",
      text: close,
      size: 0,
      type: "bracket",
      collapsed: false,
    });
  };
  walk(value, ROOT, 0, null);
  return lines;
};

/** Ids of the lines whose key or value holds the query, in display order, collapsed or not. */
const search = (value: unknown, query: string) => {
  const found: string[] = [];
  const walk = (value: unknown, id: string, key: string | null) => {
    const entries: [string | number, unknown][] | null = Array.isArray(value)
      ? [...value.entries()]
      : isRecord(value)
        ? Object.entries(value)
        : null;
    if ((key != null && includes(key, query)) || (!entries && includes(String(value), query)))
      found.push(id);
    for (const [k, child] of entries ?? [])
      walk(child, childId(id, k), Array.isArray(value) ? null : String(k));
  };
  walk(value, ROOT, null);
  return found;
};

const valueColour: Record<Line["type"], string> = {
  string: "text-green-700 dark:text-green-400",
  number: "text-amber-700 dark:text-amber-400",
  boolean: "text-violet-700 dark:text-violet-300",
  null: "text-muted-foreground",
  bracket: "text-muted-foreground",
};

const Row = ({
  line,
  start,
  selected,
  focused,
  match,
  onToggle,
}: {
  line: Line;
  start: number;
  selected: boolean;
  focused: boolean;
  /** A search match's tint, in place of the selection's. */
  match: string;
  onToggle: (id: string) => void;
}) => {
  const folder = line.kind == "open" && line.size > 0;
  return (
    <div
      id={`state-${line.id}`}
      role="treeitem"
      aria-level={line.depth + 1}
      aria-expanded={folder ? !line.collapsed : undefined}
      aria-selected={selected}
      data-line={line.id}
      className={cn(
        "absolute inset-x-0 top-0 flex cursor-default items-center gap-1 pr-2 font-mono text-xs whitespace-nowrap ring-inset",
        match || (selected && "bg-accent"),
        // The cursor, inside a selected object too.
        focused && "shadow-[inset_2px_0_0_var(--color-ring)]"
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
      {line.key != null && (
        <span className="text-sky-700 dark:text-sky-400">{JSON.stringify(line.key)}:</span>
      )}
      <span className={cn("truncate", valueColour[line.type])}>{line.text}</span>
      {line.collapsed && (
        <span className="text-muted-foreground">
          {line.size} {line.text.startsWith("[") ? "items" : "keys"}
        </span>
      )}
    </div>
  );
};

type MenuTarget = { keys: string[] };

/** A line's context menu. Highlighting is for node objects only; the rest is for any value. */
const StateMenu = ({
  store,
  editorId,
  json,
  anchor,
  tree,
  onHighlight,
}: {
  store: PanelStore;
  editorId: number;
  json: unknown;
  anchor: MenuAnchor<MenuTarget>;
  tree: HTMLElement | null;
  onHighlight: (path: Path) => void;
}) => {
  const { subscribe, get, setTrigger } = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const keys = target?.keys ?? [];
  const path = nodePathOf(keys);
  const log = (json: boolean) =>
    (path
      ? store.transport.send({ type: "logNode", id: editorId, path, json })
      : store.transport.send({ type: "logState", id: editorId, keys, json })
    ).catch(() => {});
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => tree ?? true}>
        <CopySelection text={target?.selection} />
        {path && (
          <>
            <ContextMenuItem className="text-xs" onClick={() => onHighlight(path)}>
              <ViewfinderCircleIcon /> Highlight in the editor
            </ContextMenuItem>
            <ContextMenuItem className="text-xs" onClick={() => store.showNode(editorId, path)}>
              <RectangleGroupIcon /> Show in Structure
            </ContextMenuItem>
          </>
        )}
        <ContextMenuItem className="text-xs" onClick={() => void log(false)}>
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void log(true)}>
          <CodeBracketIcon /> Log as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            void copy(JSON.stringify(keys.reduce<unknown>(childOf, json), null, 2) ?? "undefined")
          }
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={!keys.length}
          onClick={() => void copy(accessor(keys).replace(/^\./, ""))}
        >
          <MapPinIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

// Outside the component: the React Compiler can't compile conditionals inside a try/catch yet.
const replaceFrom = async (
  store: PanelStore,
  editorId: number,
  file: File,
  notify: (notice: Notice) => void
) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    notify({
      ok: false,
      text: `${file.name} isn't JSON: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  try {
    const { exact } = await store.transport.send({
      type: "replaceState",
      id: editorId,
      json: parsed,
    });
    notify({
      ok: true,
      text: `State replaced from ${file.name}${exact ? "" : ", then changed by the editor (an appender or a filter)"}. Undo reverts it.`,
    });
  } catch (e) {
    notify({
      ok: false,
      text: `Couldn't replace the state: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
};

/** The editor's state as plain JSON (`GardState.toJSON`), collapsible and virtualized. Mounted per editor. */
export const State = ({ store, editorId }: { store: PanelStore; editorId: number }) => {
  const [source] = useState(() => createStateSource(store.transport, editorId));
  const { json, loaded, error } = useSyncExternalStore(source.subscribe, source.get);

  // The outcome of a replace: shown for 5 s, then closed. Timers, not transitionend: it doesn't
  // fire with reduced motion.
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const notify = (next: Notice) => {
    for (const timer of noticeTimers.current) clearTimeout(timer);
    setNotice(next);
    noticeTimers.current = [
      setTimeout(() => setNotice((shown) => shown && { ...shown, closing: true }), SHOWN_MS),
      setTimeout(() => setNotice(null), SHOWN_MS + CLOSING_MS),
    ];
  };
  const editorName = () =>
    store.get().editors.find((editor) => editor.id == editorId)?.name ?? "editor";

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  // Nothing until the user picks a line.
  const [focused, setFocused] = useState<string | null>(null);
  // State: the rows are read from it when this component renders.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const lines = loaded ? flatten(json, collapsed) : [];

  const { indices, height } = useRows(scrollElement, lines.length, ROW);

  // A node highlighted from the menu stays outlined in the page until a line is clicked, the
  // document changes, or the tab or editor does.
  const outlined = useRef(false);
  const highlight = useCallback(
    (path: Path | null) => {
      if (!path && !outlined.current) return;
      outlined.current = path != null;
      store.transport.send({ type: "highlight", id: editorId, path }).catch(() => {});
      if (path)
        store.transport.send({ type: "scrollIntoView", id: editorId, path }).catch(() => {});
    },
    [store, editorId]
  );

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
      const shown = () => store.get().view == "state";
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
      // The outline follows a path: after an edit it could be another node's.
      const stopDoc = store.onDocChanged((id) => {
        if (id == editorId) highlight(null);
      });
      const stopStore = store.subscribe(() => {
        if (!shown()) highlight(null);
        else if (stale) load();
      });
      if (shown()) load();
      return () => {
        highlight(null);
        stopState();
        stopDoc();
        stopStore();
      };
    },
    [store, editorId, source, highlight]
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
      {error != null && (
        <p role="alert" className="flex items-center gap-2 border-b px-2 py-1 text-destructive">
          Couldn't load the state: {error}
          <Button variant="outline" size="xs" onClick={() => void source.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="flex h-7 shrink-0 items-center gap-1 border-b bg-strip px-2 text-xs">
        <SearchBox
          search={searching}
          label="Search the state"
          placeholder="Search keys and values"
        />
        <Tip
          label={
            <span className="block max-w-72">
              <code className="font-mono">GardState.toJSON()</code>, with the named fields that
              serialise
            </span>
          }
        >
          <button
            type="button"
            aria-label="About the state"
            className="flex text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
          >
            <InformationCircleIcon />
          </button>
        </Tip>
        <span className="flex items-center gap-1">
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
              // The root stays open: its keys show.
              onClick={collapseAll}
            >
              <ChevronDownUpIcon />
            </Button>
          </Tip>
          <Tip label="Log the state to the page's console">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Log the state to the page's console"
              onClick={() =>
                store.transport.send({ type: "logState", id: editorId, keys: [] }).catch(() => {})
              }
            >
              <CommandLineIcon />
            </Button>
          </Tip>
          <Tip label="Log the state's JSON to the page's console">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Log the state's JSON to the page's console"
              onClick={() =>
                store.transport
                  .send({ type: "logState", id: editorId, keys: [], json: true })
                  .catch(() => {})
              }
            >
              <CodeBracketIcon />
            </Button>
          </Tip>
          <CopyButton label="Copy the JSON" text={() => JSON.stringify(json, null, 2)} />
          <Tip label="Download the state as a JSON file">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Download the state as a JSON file"
              disabled={!loaded}
              onClick={() => download(json, fileName(editorName()))}
            >
              <ArrowDownTrayIcon />
            </Button>
          </Tip>
          <Tip label="Replace the state from a JSON file">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Replace the state from a JSON file"
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
            </Button>
          </Tip>
        </span>
      </div>
      {notice && (
        // Grid rows ease between 0fr and 1fr: a height transition to and from the content's own.
        <div
          data-closing={notice.closing || undefined}
          className={cn(
            "grid shrink-0 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none starting:grid-rows-[0fr]",
            notice.closing ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <p
              role={notice.ok ? "status" : "alert"}
              className={cn(
                "flex items-center gap-2 border-b px-2 py-1 text-xs",
                notice.ok
                  ? "bg-green-500/15 text-green-800 dark:text-green-300"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {notice.text}
            </p>
          </div>
        </div>
      )}
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
          highlight(null);
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
