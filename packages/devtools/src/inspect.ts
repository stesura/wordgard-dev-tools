import type { Wordgard } from "wordgard/editor";
import type { Path, Push } from "./protocol.ts";
import { byAgent } from "./reads.ts";
import type { Entry, Registry } from "./registry.ts";
import { PICK_CURSOR } from "./pick-cursor.ts";
import { locate } from "./serialise.ts";

// Loaded with the serialisers, on the first panel request.

const OVERLAY = "data-wordgard-devtools-overlay";

const listen = (
  on: boolean,
  type: string,
  listener: (event: Event) => void,
  options: AddEventListenerOptions
) => {
  if (on) window.addEventListener(type, listener, options);
  else window.removeEventListener(type, listener, options);
};

const style = (element: HTMLElement, css: Partial<Record<string, string>>) => {
  for (const [key, value] of Object.entries(css))
    if (value != null) element.style.setProperty(key, value);
};

const resolveIn = (wg: Wordgard, pos: number) => {
  const resolved = wg.state.doc.resolve(pos);
  const plotPath: number[] = [];
  let plot = resolved.parent;
  while (plot.parent) {
    plotPath.unshift(plot.index);
    plot = plot.parent;
  }
  return { resolved, plotPath };
};

/** The path of the node starting at `pos`. */
const pathBefore = (wg: Wordgard, pos: number): Path => {
  const { resolved, plotPath } = resolveIn(wg, pos);
  return [...plotPath, resolved.index];
};

/**
 * The text leaf under the pointer: the one its position falls in, or, at a leaf boundary (where
 * the position belongs to the parent), the one on the pointer's side, if the pointer is over it.
 */
const textAt = (wg: Wordgard, event: MouseEvent): Path | null => {
  const { clientX: x, clientY: y } = event;
  const { pos, side } = wg.posAtCoords({ x, y });
  const { resolved, plotPath } = resolveIn(wg, pos);
  if (resolved.inText) return [...plotPath, resolved.index];
  const index = side < 0 ? resolved.index - 1 : resolved.index;
  if (!resolved.parent.node.content[index]?.isText) return null;
  const path = [...plotPath, index];
  const over = boxRects(nodeBox(wg, path).box).some(
    (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  );
  return over ? path : null;
};

/** What shows the node at `path`: its element, or a range over a text leaf. */
const nodeBox = (wg: Wordgard, path: Path): { box: Element | Range; name: string } => {
  if (!path.length) return { box: wg.contentDOM, name: "Document" };
  const found = locate(wg.state.doc, path);
  if (!found) throw new Error(`No node at path [${path.join(", ")}]`);
  const { node, from } = found;
  // nodeDOM is null for text.
  const element = node.isText ? null : wg.nodeDOM(from);
  if (element) return { box: element, name: node.name };
  const start = wg.domAtPos(from, 1);
  const end = wg.domAtPos(from + node.length, -1);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return { box: range, name: node.name };
};

const boxRects = (box: Element | Range): DOMRect[] =>
  box instanceof Element
    ? [box.getBoundingClientRect()]
    : [...box.getClientRects()].filter((rect) => rect.width || rect.height);

const connected = (box: Element | Range) =>
  box instanceof Element ? box.isConnected : box.startContainer.isConnected;

type Measure = () => { rects: DOMRect[]; name: string };

/**
 * Measures the node at `path`, following the page's layout. Reads the cached DOM, not Wordgard
 * (whose reads flush a pending update early, blamed on the agent): the path is resolved again only
 * when its element is gone, or a new state stayed a frame, so the editor's own flush, scheduled in
 * the frame after the update, has drawn it.
 */
const trackNode = (wg: Wordgard, path: Path): Measure => {
  let { box, name } = nodeBox(wg, path);
  let drawn = wg.state;
  let seen = wg.state;
  return () => {
    const { state } = wg;
    if ((state != drawn && state == seen) || !connected(box)) {
      ({ box, name } = nodeBox(wg, path));
      drawn = state;
    }
    seen = state;
    return { rects: boxRects(box), name };
  };
};

const trackDOM = (target: Node, name: string): Measure => {
  let range: Range | null = null;
  return () => {
    // Redrawn since: the outline goes (`follow` hides it on the throw).
    if (!target.isConnected) throw new Error("That element is gone");
    if (target instanceof Element) return { rects: [target.getBoundingClientRect()], name };
    range ??= document.createRange();
    range.selectNodeContents(target);
    return { rects: boxRects(range), name };
  };
};

const same = (a: DOMRect[], b: DOMRect[]) =>
  a.length == b.length &&
  a.every((r, i) => {
    const s = b[i];
    return s && r.x == s.x && r.y == s.y && r.width == s.width && r.height == s.height;
  });

/** The element showing the node: its own, or, for text, the element holding its start. */
const nodeElement = (wg: Wordgard, path: Path): Element => {
  if (!path.length) return wg.contentDOM;
  const found = locate(wg.state.doc, path);
  if (!found) throw new Error(`No node at path [${path.join(", ")}]`);
  const element = found.node.isText ? null : wg.nodeDOM(found.from);
  if (element) return element;
  const { node } = wg.domAtPos(found.from, 1);
  return node instanceof Element ? node : (node.parentElement ?? wg.contentDOM);
};

export type Inspector = {
  highlight: (entry: Entry | null, path: Path | null) => void;
  pick: (on: boolean) => void;
  /** Scrolls the node into view: its editor's scroller and the page, without a transaction. */
  scrollIntoView: (entry: Entry, path: Path) => void;
  /** Outlines a DOM node of an editor's view (the View tab): an element's box, a text's line boxes. */
  outlineDOM: (target: Node, label: string) => void;
  /** Ends picking and hides the overlay (the panel went away). */
  stop: () => void;
};

export const createInspector = (registry: Registry, push: (message: Push) => void): Inspector => {
  // Outside every editor's contentDOM, the only part Wordgard's DOM observer watches.
  let overlay: HTMLElement | null = null;
  // Who asked for the outline: a click on a node in the panel (`highlight`) or the pointer while picking.
  // `measure` runs every frame while shown: the node moves with scrolling, edits and any layout change.
  let shown: {
    measure: Measure;
    rects: DOMRect[];
    name: string;
    by: "highlight" | "pick";
  } | null = null;
  let frame = 0;

  const render = (rects: DOMRect[], name: string) => {
    overlay ??= document.createElement("div");
    overlay.setAttribute(OVERLAY, "");
    // One below the in-page panel's dock (2147483647): the outline passes under it.
    style(overlay, {
      position: "fixed",
      inset: "0",
      "pointer-events": "none",
      "z-index": "2147483646",
    });
    overlay.replaceChildren(
      ...rects.map((rect) => {
        const box = document.createElement("div");
        style(box, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          background: "rgba(66, 133, 244, 0.2)",
          outline: "1px solid rgba(66, 133, 244, 0.9)",
        });
        return box;
      })
    );
    const first = rects[0];
    if (first) {
      const label = document.createElement("div");
      label.textContent = name;
      style(label, {
        position: "fixed",
        left: `${first.left}px`,
        top: `${Math.max(0, first.top - 18)}px`,
        padding: "0 4px",
        font: "11px/16px ui-monospace, monospace",
        color: "#fff",
        background: "rgba(66, 133, 244, 0.9)",
        "border-radius": "2px",
      });
      overlay.append(label);
    }
    if (!overlay.isConnected) document.body.append(overlay);
  };

  const hide = () => {
    shown = null;
    cancelAnimationFrame(frame);
    frame = 0;
    overlay?.remove();
  };

  // Redraws only when the node moved, resized or changed type.
  const follow = () => {
    frame = 0;
    if (!shown) return;
    const current = shown;
    try {
      const { rects, name } = byAgent(current.measure);
      if (name != current.name || !same(rects, current.rects)) {
        render(rects, name);
        shown = { ...current, rects, name };
      }
      frame = requestAnimationFrame(follow);
    } catch {
      // The node or its editor went away: the outline is gone.
      hide();
    }
  };

  /** Throws (nodeDOM/domAtPos on a disconnected or flushing editor) after hiding the outline. */
  const outline = (track: () => Measure, by: "highlight" | "pick") => {
    try {
      const measure = track();
      const { rects, name } = measure();
      render(rects, name);
      shown = { measure, rects, name, by };
      frame ||= requestAnimationFrame(follow);
    } catch (e) {
      hide();
      throw e;
    }
  };

  const show = (wg: Wordgard, path: Path, by: "highlight" | "pick") =>
    outline(() => trackNode(wg, path), by);

  // From the pointer while picking: reads the agent made.
  const tryShow = (wg: Wordgard, path: Path, by: "highlight" | "pick") => {
    try {
      byAgent(() => show(wg, path, by));
    } catch {
      // The editor went away, or is mid-flush: the outline is gone.
    }
  };

  // Picking: events in an editor's content are swallowed (Wordgard starts its selection on
  // mousedown); events elsewhere (the in-page panel, an editor's own panels and menus) go through.
  let picking = false;

  const editorOf = (event: Event) => {
    const path = event.composedPath();
    for (const entry of registry.editors.values())
      if (path.includes(entry.wg.contentDOM)) return entry;
    return null;
  };

  const resolve = (entry: Entry, event: MouseEvent): Path => {
    const { wg } = entry;
    const target = event.composedPath().find((node) => node instanceof Element);
    const found = target instanceof Element ? wg.nodeFromDOM(target) : null;
    const path = found ? pathBefore(wg, found.pos) : [];
    // Over text, the leaf under the pointer.
    try {
      const leaf = textAt(wg, event);
      if (leaf && leaf.length > path.length && path.every((n, i) => n == leaf[i])) return leaf;
    } catch {
      // Outside the content's text: the element's node it is.
    }
    return path;
  };

  const swallow = (event: Event) => {
    if (!editorOf(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onMove = (event: Event) => {
    const entry = editorOf(event);
    if (entry && event instanceof MouseEvent)
      tryShow(
        entry.wg,
        byAgent(() => resolve(entry, event)),
        "pick"
      );
    // Off the editors, only the picker's own outline goes: a clicked node's stays.
    else if (shown?.by == "pick") hide();
  };

  const onClick = (event: Event) => {
    const entry = editorOf(event);
    if (!entry || !(event instanceof MouseEvent)) return;
    swallow(event);
    const path = byAgent(() => resolve(entry, event));
    end();
    push({ type: "picked", id: entry.id, path });
  };

  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.key != "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pick(false);
  };

  const swallowed = ["pointerdown", "mousedown", "mouseup", "pointerup", "dblclick", "contextmenu"];

  // The pick icon as the cursor over the editors' content: a stylesheet adopted by the document and
  // by each shadow root holding an editor (no attribute on the editor's DOM, which Wordgard owns).
  let cursor: { sheet: CSSStyleSheet; roots: (Document | ShadowRoot)[] } | null = null;
  const setCursor = (on: boolean) => {
    if (cursor) {
      for (const root of cursor.roots)
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s != cursor?.sheet);
      cursor = null;
    }
    if (!on) return;
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`wg-content, wg-content * { cursor: ${PICK_CURSOR} !important; }`);
    const roots = new Set<Document | ShadowRoot>([document]);
    for (const { wg } of registry.editors.values())
      if (wg.root instanceof ShadowRoot) roots.add(wg.root);
    for (const root of roots) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    cursor = { sheet, roots: [...roots] };
  };

  const end = () => {
    if (!picking) return false;
    picking = false;
    setCursor(false);
    for (const type of swallowed) listen(false, type, swallow, { capture: true });
    listen(false, "mousemove", onMove, { capture: true });
    listen(false, "click", onClick, { capture: true });
    listen(false, "keydown", onKey, { capture: true });
    if (shown?.by == "pick") hide();
    return true;
  };

  // Ended without a pick, by whichever client or by Escape: every panel learns, so a panel
  // that started picking doesn't stay in pick mode after another stopped it.
  const pick = (on: boolean) => {
    if (!on) {
      if (end()) push({ type: "pickCancelled" });
      return;
    }
    if (picking) return;
    picking = true;
    setCursor(true);
    for (const type of swallowed) listen(true, type, swallow, { capture: true });
    listen(true, "mousemove", onMove, { capture: true });
    listen(true, "click", onClick, { capture: true });
    listen(true, "keydown", onKey, { capture: true });
  };

  return {
    highlight: (entry, path) => {
      if (!entry || !path) {
        if (shown?.by == "highlight") hide();
        return;
      }
      show(entry.wg, path, "highlight");
    },
    pick,
    outlineDOM: (target, label) => outline(() => trackDOM(target, label), "highlight"),
    scrollIntoView: (entry, path) => {
      nodeElement(entry.wg, path).scrollIntoView({ block: "center", inline: "nearest" });
    },
    stop: () => {
      pick(false);
      hide();
    },
  };
};
