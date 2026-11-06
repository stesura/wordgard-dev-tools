import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import { createMenuAnchor, type MenuAnchor } from "../menu-anchor.ts";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
});

// Rows match `[data-index]`; so does an ancestor outside the view, as Base UI's tab panels do.
const View = ({ anchor }: { anchor: MenuAnchor<{ index: number }> }) => {
  const { setTrigger, onContextMenu, onKeyDown } = anchor;
  return (
    <div data-index="0">
      <div data-view onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
        <div data-index="1" tabIndex={0}>
          <span data-inside>one</span>
        </div>
        <div data-index="2" tabIndex={0}>
          two
        </div>
        <p data-gap>between the rows</p>
      </div>
      <span data-trigger ref={setTrigger} />
    </div>
  );
};

const setup = () => {
  const focused: number[] = [];
  const anchor = createMenuAnchor(
    "[data-index]",
    (row) => ({ index: Number(row.dataset.index) }),
    (_, target) => focused.push(target.index)
  );
  host = document.createElement("div");
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  flushSync(() => created.render(<View anchor={anchor} />));
  const find = (selector: string) => {
    const found = host?.querySelector<HTMLElement>(selector);
    if (!found) throw new Error(`No ${selector}`);
    return found;
  };
  // Where the menu opens: the hidden trigger gets the contextmenu event.
  const opened: { x: number; y: number }[] = [];
  find("[data-trigger]").addEventListener("contextmenu", (event) =>
    opened.push({ x: event.clientX, y: event.clientY })
  );
  return { anchor, focused, opened, find };
};

const rightClick = (element: HTMLElement) => {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 5,
    clientY: 6,
  });
  element.dispatchEvent(event);
  return event;
};

const press = (element: HTMLElement, key: string, shiftKey = false) =>
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })
  );

it("opens on the row right-clicked, focusing it, where the pointer is", () => {
  const { anchor, focused, opened, find } = setup();
  const event = rightClick(find("[data-inside]"));
  expect(event.defaultPrevented).toBe(true);
  expect(anchor.target.get()).toMatchObject({
    index: 1,
    row: find("[data-index='1']"),
    selection: null,
  });
  expect(focused).toEqual([1]);
  expect(opened).toEqual([{ x: 5, y: 6 }]);
});

it("ignores a right-click between rows, though an ancestor outside matches", () => {
  const { anchor, opened, find } = setup();
  const event = rightClick(find("[data-gap]"));
  expect(event.defaultPrevented).toBe(false);
  expect(anchor.target.get()).toBeNull();
  expect(opened).toEqual([]);
});

it("opens on the focused row from Shift+F10 or the ContextMenu key, under it", () => {
  const { anchor, opened, find } = setup();
  const row = find("[data-index='2']");
  row.focus();
  press(row, "F10", true);
  expect(anchor.target.get()?.index).toBe(2);
  const rect = row.getBoundingClientRect();
  expect(opened).toEqual([{ x: rect.left + 16, y: rect.bottom }]);
  press(row, "ContextMenu");
  expect(opened.length).toBe(2);
  // F10 alone, or another key: not the menu's.
  press(row, "F10");
  press(row, "Enter");
  expect(opened.length).toBe(2);
});
