import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

// Paragraph 0–6: "a" 1–2, "bc" (Strong) 2–4, "d" 4–5.
const doc = "<p>a<strong>bc</strong>d</p>";

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

const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent == name
  );
const panel = () => shadow().querySelector<HTMLElement>("[data-slot='tabs-content']:not([hidden])");
/** A card, by name; a position's at `pos`. */
const card = (name: string, pos?: number) => {
  const found = panel()?.querySelector<HTMLElement>(`[data-section='${name}']`);
  return pos == null || found?.querySelector("h3")?.textContent?.endsWith(`Pos at ${pos}`)
    ? found
    : null;
};

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

const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), wordgardDevtools()],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Selection"))).click();
  return editor;
};

it("resolves the cursor, live", async () => {
  const editor = await setup();
  await until(() => card("Cursor", 1));
  expect(card("Cursor")?.textContent).toContain("at start");
  editor.dispatch({ selection: { anchor: 3 } });
  const cursor = await until(() => card("Cursor", 3));
  expect(cursor.textContent).toContain("1 into the text");
  expect(cursor.textContent).toContain('"b"');
  expect(cursor.textContent).toContain('"c"');
  expect(card("Selection")?.textContent).toContain("activeMarksStrong");
});

it("shows the active marks in the bar, and whether the cursor stores them", async () => {
  const editor = await setup();
  const marks = () =>
    shadow().querySelector<HTMLElement>("[aria-label='Selection'] [data-active-marks]");
  await until(() => card("Cursor", 1));
  expect(marks()).toBeNull();
  editor.dispatch({ selection: { anchor: 3 } });
  await until(() => marks()?.textContent == "activeMarks:Strong");
  editor.dispatch({ selection: { anchor: 1, marks: [] } });
  await until(() => marks()?.textContent == "activeMarks:none(stored)");
});

it("resolves the anchor and head of a range, and any position", async () => {
  const editor = await setup();
  editor.dispatch({ selection: { anchor: 4, head: 2 } });
  await until(() => card("Anchor", 4) && card("Head", 2));
  const input = await until(() =>
    panel()?.querySelector<HTMLInputElement>("[aria-label='Position to resolve']")
  );
  await userEvent.fill(input, "5");
  await until(() => card("Position", 5)?.textContent?.includes("at end"));
  await userEvent.fill(input, "99");
  await until(() =>
    panel()?.querySelector("[role='alert']")?.textContent?.includes("outside the document")
  );
  // The bar's "Selection" opens the tab.
  (await until(() => tab("State"))).click();
  [...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Selection'] button")]
    .find((button) => button.textContent == "Selection")
    ?.click();
  await until(() => tab("Selection")?.getAttribute("aria-selected") == "true");
});

it("resolves positions in a resizable pane, beside the selection when wide, under it when narrow", async () => {
  await setup();
  const resolved = await until(() =>
    panel()?.querySelector<HTMLElement>("aside[aria-label='Resolved positions']")
  );
  await until(() => resolved.querySelector("[data-section='Cursor']"));
  expect(resolved.querySelector("[aria-label='Position to resolve']")).not.toBeNull();
  expect(resolved.contains(card("Selection") ?? null)).toBe(false);
  const handle = panel()?.querySelector("[data-slot='resizable-handle']");
  const wide = (panel()?.clientWidth ?? 0) >= 768;
  // A vertical handle sits between panes side by side.
  expect(handle?.getAttribute("aria-orientation")).toBe(wide ? "vertical" : "horizontal");
});

it("links its nodes to the Structure and their types to the Schema", async () => {
  await setup();
  const cursor = await until(() => card("Cursor", 1));
  const button = (text: string) =>
    [...cursor.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent == text
    );
  (await until(() => button("[0]"))).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await until(() =>
    shadow().querySelector(
      "[aria-label='Document structure'] [data-path='0'][aria-selected='true']"
    )
  );
  (await until(() => tab("Selection"))).click();
  (await until(() => button("Paragraph"))).click();
  await until(() => shadow().querySelector("[data-type='node-Paragraph'][aria-current='true']"));
});

it("shows the selection's slice, and logs and copies the positions", async () => {
  const editor = await setup();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  await until(() => card("Slice")?.textContent?.includes("empty"));
  // "bc" and "d": the end of the Strong text and the next one, in the paragraph's context.
  editor.dispatch({ selection: { anchor: 3, head: 5 } });
  const slice = await until(() => card("Slice")?.textContent?.includes("2 long") && card("Slice"));
  expect(slice.textContent).toContain('text"cd"');
  expect(slice.textContent).toContain('Text"c"Strong');
  expect(slice.textContent).toContain("contextParagraph");
  // From each card's context menu.
  const choose = async (section: HTMLElement, text: string) => {
    await until(() => !shadow().querySelector("[role='menu']"));
    rightClick(section);
    (await until(() => item(text))).click();
  };
  await choose(await until(() => card("Slice")), "Log to console");
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] state.selection.toSlice(state.doc)")
  );
  await choose(await until(() => card("Anchor", 3)), "Log to console");
  await until(() => logged.some((args) => args[0] == "[wordgard-devtools] doc.resolve(3)"));
  await choose(await until(() => card("Head", 5)), "Copy JSON");
  await until(() => copied.some((text) => JSON.parse(text).pos == 5));
  // The cards show no buttons of their own.
  expect(
    card("Head", 5)?.querySelector("button[aria-label^='Log'], button[aria-label^='Copy']")
  ).toBeNull();
});

it("clears the typed position from its card's menu", async () => {
  await setup();
  const input = await until(() =>
    panel()?.querySelector<HTMLInputElement>("[aria-label='Position to resolve']")
  );
  await userEvent.fill(input, "2");
  const position = await until(() => card("Position", 2));
  rightClick(position);
  (await until(() => item("Clear"))).click();
  await until(() => !card("Position", 2));
  expect(input.value).toBe("");
});

it("explains resolved positions in a guide, linking to Wordgard's reference", async () => {
  await setup();
  (
    await until(() =>
      panel()?.querySelector<HTMLElement>("[aria-label='About Resolved positions']")
    )
  ).click();
  const popup = await until(() =>
    shadow().querySelector<HTMLElement>("[data-slot='popover-content']")
  );
  expect(popup.textContent).toContain("doc.resolve(pos)");
  expect(
    popup.querySelector("a[href='https://wordgard.net/docs/ref/#h-resolved-positions']")
  ).not.toBeNull();
});

it("gives each card its guide, the Selection card's explaining selections", async () => {
  await setup();
  const guide = await until(() =>
    card("Selection")?.querySelector<HTMLButtonElement>("[aria-label='About Selection']")
  );
  expect(card("JSON")?.querySelector("[aria-label='About JSON']")).not.toBeNull();
  expect(card("Slice")?.querySelector("[aria-label='About Slice']")).not.toBeNull();
  // Dimmed until open, unlike the tab bar's guide.
  expect(guide.classList.contains("opacity-50")).toBe(true);
  expect(
    shadow()
      .querySelector("[aria-label='About the Selection tab']")
      ?.classList.contains("opacity-50")
  ).toBe(false);
  guide.click();
  await until(() =>
    shadow()
      .querySelector("[data-slot='popover-content']")
      ?.textContent?.includes("A node selection covers one node")
  );
  expect(guide.hasAttribute("data-popup-open")).toBe(true);
});

it("shows the node holding the selection, from its bar or its card's menu", async () => {
  await setup();
  const selected = () =>
    shadow().querySelector("[aria-label='Document structure'] [aria-selected='true']");
  // The cursor at 1: in the first paragraph.
  (
    await until(() =>
      panel()?.querySelector<HTMLButtonElement>(
        "[aria-label='Show the node holding the selection']:not(:disabled)"
      )
    )
  ).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await until(() => selected()?.getAttribute("data-path") == "0");

  (await until(() => tab("Selection"))).click();
  rightClick(await until(() => card("Selection")));
  (await until(() => item("Show the node holding the selection"))).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
});
