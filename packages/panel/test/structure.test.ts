import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Decoration, Widget, Wordgard } from "wordgard/editor";
import { GardSelection } from "wordgard/state";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import {
  inPageTransport,
  mountDevtools,
  type MountedDevtools,
  type Transport,
} from "../src/index.ts";

// Heading 0–7 ("Title" 1–6), Paragraph 7–19 ("Alpha " 8–14, "bold" 14–18), Paragraph 19–25.
const doc = "<h1>Title</h1><p>Alpha <strong>bold</strong></p><p>Beta</p>";

let wg: Wordgard | null = null;
let mounted: MountedDevtools | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  wg?.dom.remove();
  wg = null;
  localStorage.clear();
  vi.restoreAllMocks();
});

const until = async <T>(get: () => T | null | undefined | false, timeout = 2000): Promise<T> => {
  const start = performance.now();
  for (;;) {
    const value = get();
    if (value) return value;
    if (performance.now() - start > timeout) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const shadow = () => {
  const root = mounted?.host.shadowRoot;
  if (!root) throw new Error("No shadow root");
  return root;
};

const structure = () => shadow().querySelector<HTMLElement>("[aria-label='Document structure']");
const box = (path: string) => structure()?.querySelector<HTMLElement>(`[data-path='${path}']`);
const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent == name
  );
const pane = () =>
  shadow().querySelector<HTMLElement>(
    "[data-slot='tabs-content']:not([hidden]) [aria-label='Node']"
  );

/** The in-page transport, counting `structure` and `scrollIntoView` requests. */
const counting = () => {
  const inner = inPageTransport();
  const counts = { structure: 0, scrollIntoView: 0 };
  const transport: Transport = {
    send: (request) => {
      if (request.type == "structure") counts.structure++;
      if (request.type == "scrollIntoView") counts.scrollIntoView++;
      return inner.send(request);
    },
    onPush: (listener) => inner.onPush(listener),
  };
  return { transport, counts };
};

const setup = async (transport?: Transport) => {
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), wordgardDevtools({ name: "s" })],
  });
  wg = editor;
  mounted = mountDevtools({ transport });
  await mounted.ready;
  await until(() => box("1"));
  return editor;
};

const showStructure = async () => {
  (await until(() => tab("Structure"))).click();
  return until(() => box("1.1"));
};

it("draws the document as nested boxes with positions", async () => {
  await setup();
  await showStructure();
  expect(box("0")?.textContent).toMatch(/^Heading.*0–7/);
  expect(box("0.0")?.textContent).toBe('"Title"1–6');
  expect(box("1")?.textContent).toContain("7–19");
  expect(box("1.1")?.textContent).toBe('"bold"Strong14–18');
  expect(box("")?.textContent).toMatch(/^Doc0–25/);
});

it("follows the document", async () => {
  const editor = await setup();
  await showStructure();
  editor.dispatch({ changes: { from: 8, insert: [Leaf.text("New ")] } });
  await until(() => box("1.0")?.textContent == '"New Alpha "8–18');
  expect(box("2")?.textContent).toContain("23–29");
});

it("outlines a clicked box's node in the page and shows it, not a hovered one", async () => {
  await setup();
  const strong = await showStructure();
  await userEvent.hover(strong);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(document.querySelector("[data-wordgard-devtools-overlay]")).toBeNull();
  strong.click();
  await until(
    () => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent == "Text"
  );
  await until(() => pane()?.textContent?.includes('text"bold"'));
  expect(strong.getAttribute("aria-selected")).toBe("true");
  expect(getComputedStyle(strong).boxShadow).not.toBe("none");
  // Gone with the tab.
  (await until(() => tab("State"))).click();
  await until(() => !document.querySelector("[data-wordgard-devtools-overlay]"));
});

it("marks the boxes holding the selection", async () => {
  const editor = await setup();
  await showStructure();
  editor.dispatch({ selection: { anchor: 16 } });
  await until(() => box("1.1")?.dataset.selection == "innermost");
  expect(box("1")?.dataset.selection).toBe("holds");
  expect(box("0")?.dataset.selection).toBeUndefined();
  expect(box("")?.dataset.selection).toBeUndefined();
});

it("shows a pick in the Structure, whichever tab is open, outlined in the page", async () => {
  const editor = await setup();
  (await until(() => tab("State"))).click();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']"))
  ).click();
  const strong = editor.contentDOM.querySelector("strong");
  if (!strong) throw new Error("No strong element");
  await userEvent.click(strong);
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await until(() => box("1.1")?.getAttribute("aria-selected") == "true");
  await until(() => pane()?.textContent?.includes('text"bold"'));
  // The picker's outline went with the click: the selected node's stays.
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(document.querySelector("[data-wordgard-devtools-overlay]")?.textContent).toBe("Text");
});

it("keeps its collapsed boxes across tab switches", async () => {
  await setup();
  box("1")?.querySelector<HTMLButtonElement>("button[aria-label='Collapse']")?.click();
  await until(() => !box("1.0"));
  (await until(() => tab("State"))).click();
  (await until(() => tab("Structure"))).click();
  await until(() => box("1"));
  expect(box("1.0")).toBeNull();
  expect(box("1")?.getAttribute("aria-expanded")).toBe("false");
});

it("loads the structure only while its tab is shown", async () => {
  const { transport, counts } = counting();
  const editor = await setup(transport);
  const loaded = counts.structure;
  (await until(() => tab("State"))).click();
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("A ")] } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(counts.structure).toBe(loaded);
  await showStructure();
  await until(() => box("0")?.textContent?.includes("0–9"));
  expect(counts.structure).toBe(loaded + 1);
});

const searchBox = () =>
  shadow().querySelector<HTMLInputElement>("[aria-label='Search the structure']");

it("searches text, names and params, and steps through the matches", async () => {
  await setup();
  await showStructure();
  const input = await until(() => searchBox());
  await userEvent.click(input);
  await userEvent.keyboard("bol");
  await until(() => box("1.1")?.className.includes("bg-yellow-500/40"));
  expect(input.closest("div")?.textContent).toContain("1/1");
  await until(() => pane()?.textContent?.includes('text"bold"'));
  await userEvent.clear(input);
  await userEvent.keyboard("paragraph");
  await until(() => input.closest("div")?.textContent?.includes("1/2"));
  await userEvent.keyboard("{Enter}");
  await until(() => input.closest("div")?.textContent?.includes("2/2"));
  expect(box("2")?.firstElementChild?.className).toContain("bg-yellow-500/40");
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
  await until(() => input.closest("div")?.textContent?.includes("1/2"));
});

it("walks the boxes with the arrow keys", async () => {
  await setup();
  await showStructure();
  // The header: the box's middle is its chips.
  await userEvent.click(await until(() => box("1")?.firstElementChild));
  await until(() => box("1")?.getAttribute("aria-selected") == "true");
  await userEvent.keyboard("{ArrowDown}");
  await until(() => box("1.0")?.getAttribute("aria-selected") == "true");
  expect(shadow().activeElement).toBe(box("1.0"));
  await userEvent.keyboard("{End}");
  await until(() => box("2.0")?.getAttribute("aria-selected") == "true");
});

const overlay = () => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent;
const tabStops = () => [...(structure()?.querySelectorAll("[tabindex='0']") ?? [])];
const menuItem = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(
    (element) => element.textContent?.trim() == text
  );

/** The item at `path` is focused and selected, and the tree's one tab stop. */
const focusedAt = async (path: string) => {
  await until(
    () => shadow().activeElement == box(path) && box(path)?.getAttribute("aria-selected") == "true"
  );
  expect(tabStops()).toEqual([box(path)]);
};

it("walks the tree with its keys, selecting and outlining as it goes", async () => {
  await setup();
  await userEvent.click(await showStructure());
  await focusedAt("1.1");
  // Left from a chip: to its paragraph, outlined in the page and shown in the pane.
  await userEvent.keyboard("{ArrowLeft}");
  await focusedAt("1");
  await until(() => overlay() == "Paragraph");
  await until(() => pane()?.textContent?.includes("Paragraph"));
  // Left closes an open box; from a closed one, to its parent.
  await userEvent.keyboard("{ArrowLeft}");
  await until(() => box("1")?.getAttribute("aria-expanded") == "false");
  expect(shadow().activeElement).toBe(box("1"));
  await userEvent.keyboard("{ArrowLeft}");
  await focusedAt("");
  // Right in an open box: to its first child. On a leaf: nothing.
  await userEvent.keyboard("{ArrowRight}");
  await focusedAt("0");
  await userEvent.keyboard("{ArrowRight}");
  await focusedAt("0.0");
  await userEvent.keyboard("{ArrowRight}");
  await focusedAt("0.0");
  // Down skips a closed box's content; Right opens it.
  await userEvent.keyboard("{ArrowDown}");
  await focusedAt("1");
  await userEvent.keyboard("{ArrowRight}");
  await until(() => box("1")?.getAttribute("aria-expanded") == "true");
  await userEvent.keyboard("{ArrowDown}");
  await focusedAt("1.0");
  await until(() => overlay() == "Text");
  // The ends, and nothing past them.
  await userEvent.keyboard("{End}");
  await focusedAt("2.0");
  await userEvent.keyboard("{ArrowDown}");
  await focusedAt("2.0");
  await userEvent.keyboard("{Home}");
  await focusedAt("");
  await userEvent.keyboard("{ArrowUp}");
  await focusedAt("");
});

it("keeps focus where it is on Escape, and opens the menu on it from the keyboard", async () => {
  await setup();
  await userEvent.click(await showStructure());
  await until(() => overlay() == "Text");
  await userEvent.keyboard("{Escape}");
  await until(() => !overlay());
  expect(box("1.1")?.getAttribute("aria-selected")).toBe("false");
  expect(shadow().activeElement).toBe(box("1.1"));
  expect(tabStops()).toEqual([box("1.1")]);
  // On from there.
  await userEvent.keyboard("{ArrowUp}");
  await focusedAt("1.0");
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => menuItem("Show Text type in Schema"));
  await userEvent.keyboard("{Escape}");
  await until(() => !menuItem("Show Text type in Schema") && shadow().activeElement == box("1.0"));
});

it("scrolls the focused node into view in the editor on Enter", async () => {
  const { transport, counts } = counting();
  await setup(transport);
  await userEvent.click(await showStructure());
  await userEvent.keyboard("{Enter}");
  await until(() => counts.scrollIntoView == 1);
});

it("keeps the tab stop and focus out of closed boxes", async () => {
  await setup();
  await userEvent.click(await showStructure());
  // Collapse all: the selection and the tab stop go to the block holding them.
  const collapseAll = await until(() => structureButton("Collapse all"));
  await userEvent.click(collapseAll);
  await until(() => !box("1.1"));
  expect(box("1")?.getAttribute("aria-selected")).toBe("true");
  expect(tabStops()).toEqual([box("1")]);
  await userEvent.tab();
  expect(shadow().activeElement).toBe(box("1"));
  (await until(() => structureButton("Expand all"))).click();
  // A chevron: for the mouse only, out of the item's name. Closing the box holding focus moves focus to the box.
  await userEvent.click(await until(() => box("1.1")));
  const chevron = await until(() => box("1")?.querySelector("button"));
  expect(chevron.getAttribute("aria-hidden")).toBe("true");
  await userEvent.click(chevron);
  await until(() => box("1")?.getAttribute("aria-expanded") == "false");
  await focusedAt("1");
});

it("takes focus with a Show in Structure from another tab's menu", async () => {
  await setup();
  (await until(() => tab("DOM"))).click();
  const line = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='DOM'] [data-dom='1']")
  );
  await userEvent.click(line);
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => menuItem("Show Paragraph in Structure"));
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await focusedAt("1");
});

it("scrolls a double-clicked node into view in the editor", async () => {
  const { transport, counts } = counting();
  await setup(transport);
  const strong = await showStructure();
  await userEvent.dblClick(strong);
  await until(() => counts.scrollIntoView == 1);
});

it("reveals a pick in another editor once its structure has loaded", async () => {
  await setup();
  await showStructure();
  const other = Wordgard.create({
    parent: document.body,
    doc: "<p>One</p><p>Two <em>three</em></p>",
    config: [basicSchema(), wordgardDevtools({ name: "other" })],
  });
  try {
    (
      await until(() =>
        shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']")
      )
    ).click();
    const em = other.contentDOM.querySelector("em");
    if (!em) throw new Error("No em element");
    await userEvent.click(em);
    await until(
      () =>
        box("1.1")?.getAttribute("aria-selected") == "true" &&
        box("1.1")?.textContent?.includes("three")
    );
  } finally {
    other.dom.remove();
  }
});

it("collapses and expands boxes, by their chevron and with the arrow keys", async () => {
  await setup();
  await showStructure();
  const paragraph = await until(() => box("1"));
  expect(paragraph.getAttribute("aria-expanded")).toBe("true");
  paragraph.querySelector<HTMLButtonElement>("button[aria-label='Collapse']")?.click();
  await until(() => !box("1.0"));
  expect(box("1")?.getAttribute("aria-expanded")).toBe("false");
  // Right opens it again; Left closes it.
  box("1")?.click();
  await userEvent.keyboard("{ArrowRight}");
  await until(() => box("1.0"));
  await userEvent.keyboard("{ArrowLeft}");
  await until(() => !box("1.0"));
  // A reveal opens the boxes on the way.
  await userEvent.keyboard("{ArrowRight}");
  await until(() => box("1.0"));
});

it("lets the browser skip off-screen boxes, tints marks and edges text chips", async () => {
  await setup();
  await showStructure();
  const paragraph = await until(() => box("1"));
  expect(getComputedStyle(paragraph).contentVisibility).toBe("auto");
  const strong = await until(() => box("1.1"));
  const mark = [...strong.querySelectorAll<HTMLElement>("[data-slot='badge']")].find(
    (b) => b.textContent == "Strong"
  );
  expect(mark?.style.getPropertyValue("--hue")).not.toBe("");
  expect(getComputedStyle(strong).borderRightWidth).toBe("2px");
});

// In the Structure tab's panel: the State has buttons of the same names.
const structureButton = (label: string) =>
  structure()
    ?.closest("[role='tabpanel']")
    ?.querySelector<HTMLButtonElement>(`[aria-label='${label}']`);

it("expands and collapses every box at once", async () => {
  await setup();
  await showStructure();
  structureButton("Collapse all")?.click();
  // Every box closed but the document: its blocks show, their content doesn't.
  await until(() => !box("1.1"));
  expect(box("1")?.getAttribute("aria-expanded")).toBe("false");
  expect(box("")?.getAttribute("aria-expanded")).toBe("true");
  structureButton("Expand all")?.click();
  await until(() => box("1.1"));
});

it("clears the selection and its outline", async () => {
  await setup();
  const strong = await showStructure();
  const clear = await until(() => structureButton("Clear the selection"));
  expect(clear.disabled).toBe(true);
  strong.click();
  await until(
    () => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent == "Text"
  );
  expect(clear.disabled).toBe(false);
  clear.click();
  await until(() => !document.querySelector("[data-wordgard-devtools-overlay]"));
  expect(strong.getAttribute("aria-selected")).not.toBe("true");
  expect(clear.disabled).toBe(true);
  // Escape in the tree too.
  await userEvent.click(strong);
  await until(() => document.querySelector("[data-wordgard-devtools-overlay]"));
  await userEvent.keyboard("{Escape}");
  await until(() => !document.querySelector("[data-wordgard-devtools-overlay]"));
  expect(clear.disabled).toBe(true);
});

it("marks the nodes the selection is in", async () => {
  const editor = await setup();
  await showStructure();
  // From "Title" (3) to "bold" (16), backwards.
  editor.dispatch({ selection: { anchor: 16, head: 3 } });
  await until(() => box("0.0")?.dataset.selection == "innermost");
  expect(box("1.1")?.dataset.selection).toBe("innermost");
  expect(box("0")?.dataset.selection).toBe("holds");
  editor.dispatch({ selection: { anchor: 9 } });
  await until(() => box("1.0")?.dataset.selection == "innermost");
  expect(box("0.0")?.dataset.selection).toBeUndefined();
});

it("marks a node selection on the node itself", async () => {
  const editor = await setup();
  await showStructure();
  const heading = editor.state.doc.content[0];
  if (!heading) throw new Error("No heading");
  editor.dispatch({ selection: GardSelection.node(0, heading) });
  await until(() => box("0")?.dataset.selection == "innermost");
  // Not the document holding it.
  expect(box("")?.dataset.selection).toBeUndefined();
});

it("shows what changed while paused once resumed", async () => {
  const editor = await setup();
  await showStructure();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pause the devtool']"))
  ).click();
  await until(() => shadow().textContent?.includes("The devtool is paused"));
  editor.dispatch({ changes: { from: 8, insert: [Leaf.text("Later ")] } });
  editor.flush();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Resume the devtool']"))
  ).click();
  await until(() => box("1.0")?.textContent?.includes("Later Alpha"));
});

it("links the node's type and marks to the Schema, and copies its JSON", async () => {
  await setup();
  const strong = await showStructure();
  const link = (name: string) =>
    [...(pane()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (button) => button.textContent == name
    );
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  strong.click();
  (
    await until(() =>
      pane()?.querySelector<HTMLButtonElement>('[aria-label="Copy the node\'s JSON"]')
    )
  ).click();
  await until(() =>
    copied.some((text) => text.includes('"type": "Text"') && text.includes('"Strong"'))
  );
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  (
    await until(() =>
      pane()?.querySelector<HTMLButtonElement>(`[aria-label="Log the node's JSON to the console"]`)
    )
  ).click();
  await until(() =>
    logged.some(
      (args) =>
        args[0] == "[wordgard-devtools] Text at range 14–18" &&
        JSON.stringify(args[1]).includes("Strong")
    )
  );
  (await until(() => link("Strong"))).click();
  await until(() => tab("Schema")?.getAttribute("aria-selected") == "true");
  await until(() => shadow().querySelector("[data-type='mark-Strong'][aria-current='true']"));
  (await until(() => tab("Structure"))).click();
  (await until(() => link("Text"))).click();
  await until(() => shadow().querySelector("[data-type='node-Text'][aria-current='true']"));
});

it("logs and copies the pane's values from their context menu", async () => {
  await setup();
  const strong = await showStructure();
  strong.click();
  const row = (part: string) => pane()?.querySelector<HTMLElement>(`[data-part='${part}']`);
  const item = (text: string) =>
    [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(
      (element) => element.textContent?.trim() == text
    );
  const rightClick = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 4,
        clientY: rect.top + 4,
        button: 2,
      })
    );
  };
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  rightClick(await until(() => row("mark:0")));
  (await until(() => item("Log to console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] Text at range 14–18, mark Strong")
  );
  rightClick(await until(() => row("text")));
  (await until(() => item("Copy value"))).click();
  await until(() => copied.includes('"bold"'));
  rightClick(await until(() => row("json")));
  (await until(() => item("Copy JSON"))).click();
  await until(() => copied.some((text) => text.includes('"Strong"')));
});

const marker = Widget.define<string>({ render: (value) => document.createTextNode(value) });
const highlights = () =>
  Decoration.Point.set([
    // In "Title", at offset 2.
    [Decoration.Point.widget(marker.of("in text")), 3],
    [Decoration.Point.attributes({ class: "para" }), 7],
    // Between the paragraphs.
    [Decoration.Point.widget(marker.of("between")), 19],
  ]);

it("shows decorations when asked, and follows the selection", async () => {
  const inner = inPageTransport();
  let asked = 0;
  const transport: Transport = {
    send: (request) => {
      if (request.type == "decorations") asked++;
      return inner.send(request);
    },
    onPush: (listener) => inner.onPush(listener),
  };
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [
      basicSchema(),
      Decoration.Point.source.of(highlights),
      wordgardDevtools({ name: "d" }),
    ],
  });
  wg = editor;
  mounted = mountDevtools({ transport });
  await mounted.ready;
  await showStructure();
  expect(asked).toBe(0);
  expect(structure()?.querySelector("[data-widget]")).toBeNull();

  const toggle = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent == "Decorations"
    )
  );
  toggle.click();
  await until(() => shadow().textContent?.includes("3 decorations from 2 sources"));
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(box("0.0")?.querySelector("[data-widget='3']")).not.toBeNull();
  expect(box("0.0")?.textContent).toContain('"Ti◆tle"');
  // Between the paragraphs: in the document's content, not in either paragraph.
  const between = structure()?.querySelector("[data-widget='19']");
  expect(between?.closest("[data-path]")?.getAttribute("data-path")).toBe("");
  expect(box("1")?.firstElementChild?.querySelector("[data-decorations]")?.textContent).toBe("◇ 1");

  box("1")?.click();
  const section = await until(() => pane()?.querySelector("[aria-label='Decorations']"));
  expect(section.textContent).toContain("attributes");
  expect(section.textContent).toContain('class="para"');

  // A selection-only change: the node selection's own decoration appears.
  const paragraph = editor.state.doc.nodeAt(19);
  if (!paragraph) throw new Error("No paragraph");
  editor.dispatch({ selection: GardSelection.node(19, paragraph) });
  await until(() => box("2")?.firstElementChild?.querySelector("[data-decorations]"));

  // Off: nothing more is asked.
  toggle.click();
  await until(() => !structure()?.querySelector("[data-widget]"));
  const before = asked;
  editor.dispatch({ selection: { anchor: 2 } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(asked).toBe(before);
});

it("shows a widget in an empty node, and the document's own decorations in the pane", async () => {
  // An empty paragraph 0–2, "<p>Hi</p>" 2–6.
  const placeholder = () =>
    Decoration.Point.set([
      [Decoration.Point.widget(marker.of("empty")), 1],
      [Decoration.Point.attributes({ class: "end" }), 6],
    ]);
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p></p><p>Hi</p>",
    config: [
      basicSchema(),
      Decoration.Point.source.of(placeholder),
      wordgardDevtools({ name: "e" }),
    ],
  });
  localStorage.setItem("wordgard-devtools:structure-decorations", "true");
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Structure"))).click();
  await until(() => box("0")?.querySelector("[data-widget='1']"));
  const section = await until(() => pane()?.querySelector("[aria-label='Decorations']"));
  expect(section.textContent).toContain("The document's decorations");
  expect(section.textContent).toContain("applies to no node");
});
