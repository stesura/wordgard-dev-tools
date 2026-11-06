import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
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
  expect(strong.className).toContain("ring-2");
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

it("shows a pick in the Structure, whichever tab is open", async () => {
  const editor = await setup();
  (await until(() => tab("State"))).click();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pick a node in the page']"))
  ).click();
  const strong = editor.contentDOM.querySelector("strong");
  if (!strong) throw new Error("No strong element");
  await userEvent.click(strong);
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await until(() => box("1.1")?.className.includes("ring-2"));
  await until(() => pane()?.textContent?.includes('text"bold"'));
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
  expect(input.parentElement?.textContent).toContain("1/1");
  await until(() => pane()?.textContent?.includes('text"bold"'));
  await userEvent.clear(input);
  await userEvent.keyboard("paragraph");
  await until(() => input.parentElement?.textContent?.includes("1/2"));
  await userEvent.keyboard("{Enter}");
  await until(() => input.parentElement?.textContent?.includes("2/2"));
  expect(box("2")?.firstElementChild?.className).toContain("bg-yellow-500/40");
  await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
  await until(() => input.parentElement?.textContent?.includes("1/2"));
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
      () => box("1.1")?.className.includes("ring-2") && box("1.1")?.textContent?.includes("three")
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

it("marks where the selection starts and ends, each its own way", async () => {
  const editor = await setup();
  await showStructure();
  // From "Title" (3) to "bold" (16), backwards: the start is still the earlier position.
  editor.dispatch({ selection: { anchor: 16, head: 3 } });
  const start = await until(() => box("0.0")?.querySelector("[data-selection-end='start']"));
  expect(start.getAttribute("aria-label")).toBe("Start of selection - pos 3");
  expect(box("1.1")?.querySelector("[data-selection-end='end']")?.getAttribute("aria-label")).toBe(
    "End of selection - pos 16"
  );
  editor.dispatch({ selection: { anchor: 9 } });
  await until(() => box("1.0")?.querySelector("[aria-label='Cursor - pos 9']"));
  expect(shadow().querySelector("[data-selection-end='end']")).toBeNull();
});

it("marks a node selection on the node itself", async () => {
  const editor = await setup();
  await showStructure();
  const heading = editor.state.doc.content[0];
  if (!heading) throw new Error("No heading");
  editor.dispatch({ selection: GardSelection.node(0, heading) });
  const mark = await until(() => box("0")?.querySelector("[data-selection-end='node']"));
  expect(mark.getAttribute("aria-label")).toBe("Selected node - pos 0–7");
  expect(box("0")?.dataset.selection).toBe("innermost");
  // Not on the document holding it.
  expect(box("")?.querySelector(":scope > div:first-child [data-selection-end]")).toBeNull();
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
      pane()?.querySelector<HTMLButtonElement>(
        `[aria-label="Log the node's JSON to the page's console"]`
      )
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
