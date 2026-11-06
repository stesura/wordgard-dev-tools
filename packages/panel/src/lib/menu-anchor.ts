import { atom, type ReadableAtom } from "nanostores";
import type { KeyboardEvent, MouseEvent } from "react";
import { selectedText } from "./selected-text.ts";

/**
 * One context menu per view, opened through a hidden trigger (as Stesura's editor does): no
 * menu root or trigger wraps the rows, so opening it re-renders only the menu, and Base UI keeps
 * its own anchoring and dismissal.
 *
 * Menus destructure it before use: `ref={anchor.setTrigger}` makes the React Compiler take the
 * whole anchor for a ref, and reject reading it during render.
 */
export type MenuAnchor<T> = {
  /** What the menu opened on. `selection`: the text selected in the view then, for its "Copy" item. */
  target: ReadableAtom<(T & { row: HTMLElement; selection: string | null }) | null>;
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

/** Rows match `selector`; `read` takes a row's target; `focus`: the view focuses the row the menu opens on. */
export const createMenuAnchor = <T extends object>(
  selector: string,
  read: (row: HTMLElement) => T,
  focus: (row: HTMLElement, target: T) => void
): MenuAnchor<T> => {
  const target = atom<(T & { row: HTMLElement; selection: string | null }) | null>(null);
  let trigger: HTMLElement | null = null;
  const open = (view: Element, row: HTMLElement, clientX: number, clientY: number) => {
    const found = read(row);
    focus(row, found);
    target.set({ ...found, row, selection: selectedText(view) });
    trigger?.dispatchEvent(
      new globalThis.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
      })
    );
  };
  return {
    target,
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
