import {
  BookOpenIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  CommandLineIcon,
  EyeIcon,
  MapPinIcon,
} from "#icons";
import { useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from "react";
import type { Path } from "@stesura/wordgard-dev-tools";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "#components/ui/context-menu";
import type { PanelStore } from "./store.ts";

/**
 * One context menu per view, opened through a hidden trigger (as Stesura's editor does): no
 * menu root or trigger wraps the rows, so opening it re-renders only the menu, and Base UI keeps
 * its own anchoring and dismissal.
 *
 * Menus destructure it before use: `ref={anchor.setTrigger}` makes the React Compiler take the
 * whole anchor for a ref, and reject reading it during render.
 */
export type MenuAnchor<T> = {
  /** `selection`: the text selected in the view when the menu opened, for its "Copy" item. */
  get: () => (T & { row: HTMLElement; selection: string | null }) | null;
  subscribe: (listener: () => void) => () => void;
  setTrigger: (element: HTMLElement | null) => void;
  /** For the rows' container: a right-click, or Shift+F10 / the ContextMenu key on the focused row. */
  onContextMenu: (event: MouseEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/** The focused row: the focused element's, or the one its `aria-activedescendant` names. */
const focusedRow = (container: Element, selector: string) => {
  const root = container.getRootNode();
  const active = root instanceof Document || root instanceof ShadowRoot ? root.activeElement : null;
  const descendant = active?.getAttribute("aria-activedescendant");
  const target = descendant ? active?.querySelector(`#${CSS.escape(descendant)}`) : active;
  return rowIn(container, target ?? null, selector);
};

/** The row holding `target`, if it's inside `container`: an ancestor outside can match the selector
 * too (Base UI's tab panels carry `data-index`). */
const rowIn = (container: Element, target: Element | null, selector: string) => {
  const row = target?.closest<HTMLElement>(selector);
  return row && row != container && container.contains(row) ? row : null;
};

/**
 * The text selected in `view`, when the selection reaches into it: what our menus' "Copy" copies,
 * in place of the browser's. Read as the menu opens, before it takes focus.
 */
export const selectedText = (view: Element): string | null => {
  const selection = document.getSelection();
  // Rendered text, line breaks between rows (in a shadow root too: Chromium and Firefox).
  const text = selection?.toString();
  if (!selection || !text) return null;
  const root = view.getRootNode();
  // The composed ranges reach into a shadow root; `getRangeAt` stops at its host.
  const ranges: AbstractRange[] =
    typeof selection.getComposedRanges == "function"
      ? selection.getComposedRanges({ shadowRoots: root instanceof ShadowRoot ? [root] : [] })
      : selection.rangeCount
        ? [selection.getRangeAt(0)]
        : [];
  const reaches = ranges.some((at) => {
    const range = document.createRange();
    range.setStart(at.startContainer, at.startOffset);
    range.setEnd(at.endContainer, at.endOffset);
    return range.intersectsNode(view);
  });
  return reaches ? text : null;
};

/** A menu's first item while text is selected in its view: copies it, as the browser's own menu would. */
export const CopySelection = ({ text }: { text: string | null | undefined }) =>
  text ? (
    <>
      <ContextMenuItem className="text-xs" onClick={() => void copy(text)}>
        <ClipboardDocumentIcon /> Copy
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  ) : null;

/** For a menu on its own trigger: the selection read as it opens, by the trigger's `onContextMenu`. */
export const useMenuSelection = () => {
  const [selection, setSelection] = useState<string | null>(null);
  const onContextMenu = (event: MouseEvent<Element>) => setSelection(selectedText(event.currentTarget));
  return { selection, onContextMenu };
};

/** Rows match `selector`; `read` takes a row's target; `focus`: the view focuses the row the menu opens on. */
export const createMenuAnchor = <T extends object>(
  selector: string,
  read: (row: HTMLElement) => T,
  focus: (row: HTMLElement, target: T) => void,
): MenuAnchor<T> => {
  let target: (T & { row: HTMLElement; selection: string | null }) | null = null;
  let trigger: HTMLElement | null = null;
  const listeners = new Set<() => void>();
  const open = (view: Element, row: HTMLElement, clientX: number, clientY: number) => {
    const found = read(row);
    target = { ...found, row, selection: selectedText(view) };
    focus(row, found);
    for (const listener of listeners) listener();
    trigger?.dispatchEvent(
      new globalThis.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      }),
    );
  };
  return {
    get: () => target,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTrigger: (element) => {
      trigger = element;
    },
    onContextMenu: (event) => {
      const row =
        event.target instanceof Element ? rowIn(event.currentTarget, event.target, selector) : null;
      if (!row) return;
      event.preventDefault();
      open(event.currentTarget, row, event.clientX, event.clientY);
    },
    onKeyDown: (event) => {
      if (event.key != "ContextMenu" && !(event.key == "F10" && event.shiftKey)) return;
      const row = focusedRow(event.currentTarget, selector);
      if (!row) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      open(event.currentTarget, row, rect.left + 16, rect.bottom);
    },
  };
};

type Target = { path: Path; name: string | null };
export type NodeMenuAnchor = MenuAnchor<Target>;

const pathOf = (row: HTMLElement): Path => {
  const path = row.getAttribute("data-path") ?? "";
  return path ? path.split(".").map(Number) : [];
};

export const createNodeMenuAnchor = (
  focus: (row: HTMLElement, path: Path) => void,
): NodeMenuAnchor =>
  createMenuAnchor(
    "[data-path]",
    (row) => ({ path: pathOf(row), name: row.getAttribute("data-name") }),
    (row, target) => focus(row, target.path),
  );

// Through a textarea when the Clipboard API is refused (a DevTools panel isn't always allowed it).
export const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
};

export const NodeMenu = ({
  store,
  editorId,
  anchor,
}: {
  store: PanelStore;
  editorId: number;
  anchor: NodeMenuAnchor;
}) => {
  const {subscribe, get, setTrigger} = anchor;
  const target = useSyncExternalStore(subscribe, get);
  const path = target?.path ?? [];
  const copyJSON = async () => {
    const node = await store.transport.send({ type: "node", id: editorId, path });
    await copy(JSON.stringify(node.json, null, 2));
  };
  return (
    <ContextMenu>
      <ContextMenuTrigger className="hidden">
        <span ref={setTrigger} />
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" finalFocus={() => get()?.row ?? true}>
        <CopySelection text={target?.selection} />
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "scrollIntoView", id: editorId, path }).catch(() => {})
          }
        >
          <EyeIcon /> Scroll into view in the page
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          disabled={target?.name == null}
          onClick={() => target?.name != null && store.showType(editorId, target.name)}
        >
          <BookOpenIcon /> Show {target?.name ?? "its"} type in Schema
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "logNode", id: editorId, path }).catch(() => {})
          }
        >
          <CommandLineIcon /> Log to console
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport
              .send({ type: "logNode", id: editorId, path, json: true })
              .catch(() => {})
          }
        >
          <CodeBracketIcon /> Log as JSON
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-xs" onClick={() => store.showDom(editorId, path)}>
          <CodeBracketIcon /> Show in DOM
        </ContextMenuItem>
        <ContextMenuItem
          className="text-xs"
          onClick={() =>
            store.transport.send({ type: "logNodeDOM", id: editorId, path }).catch(() => {})
          }
        >
          <CommandLineIcon /> Log DOM element
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs"
          disabled={!path.length}
          onClick={() => void copyJSON().catch(() => {})}
        >
          <ClipboardDocumentIcon /> Copy JSON
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => void copy(`[${path.join(", ")}]`)}>
          <MapPinIcon /> Copy path
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
