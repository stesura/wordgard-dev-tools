import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

let wg: Wordgard | null = null;
let mounted: MountedDevtools | null = null;

afterEach(() => {
  document.getSelection()?.removeAllRanges();
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
const items = () =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].map((element) =>
    element.textContent?.trim()
  );
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

const closeMenu = async () => {
  await userEvent.keyboard("{Escape}");
  await until(() => !items().length);
};

/** Selects the text of `element`'s first text node, from `from` to `to`. */
const select = (element: Element, from: number, to: number) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (!text) throw new Error("No text");
  document.getSelection()?.setBaseAndExtent(text, from, text, to);
};

const setup = async (view: string) => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), wordgardDevtools()],
  });
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab(view))).click();
};

const copying = () => {
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  return copied;
};

it("offers Copy for text selected in the view, and only then", async () => {
  await setup("State");
  const copied = copying();
  const line = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='State'] [data-line='$/doc/type']")
  );
  rightClick(line);
  await until(() => item("Log to console"));
  expect(items()).not.toContain("Copy");
  await closeMenu();

  // `"type":"Doc"`: the key's text node.
  select(line, 1, 5);
  rightClick(line);
  (await until(() => item("Copy"))).click();
  await until(() => copied.includes("type"));

  // Selected outside the view: the editor's text.
  select(wg?.dom ?? document.body, 0, 2);
  rightClick(line);
  await until(() => item("Log to console"));
  expect(items()).not.toContain("Copy");
});

it("offers Copy in a menu on its own trigger: a Selection card", async () => {
  await setup("Selection");
  const copied = copying();
  const card = await until(() => shadow().querySelector<HTMLElement>("[data-section] h3"));
  const title = card.textContent ?? "";
  select(card, 0, 3);
  rightClick(card);
  (await until(() => item("Copy"))).click();
  await until(() => copied.includes(title.slice(0, 3)));
});

it("gives the Schema's JSON pane a menu: log, log JSON, copy JSON, and Copy for a selection", async () => {
  await setup("Schema");
  const copied = copying();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  (await until(() => shadow().querySelector<HTMLElement>("[data-type='node-Paragraph']"))).click();
  const pre = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Spec'] [data-spec-json] pre")
  );
  rightClick(pre);
  await until(() => item("Log to console"));
  expect(items()).toEqual(["Log to console", "Log JSON", "Copy JSON"]);
  item("Copy JSON")?.click();
  await until(() => copied.some((text) => text.includes('"inlineContent": true')));

  rightClick(pre);
  (await until(() => item("Log to console"))).click();
  await until(() => logged.some((args) => String(args[0]).includes("Paragraph")));

  select(pre, 0, 1);
  rightClick(pre);
  (await until(() => item("Copy"))).click();
  await until(() => copied.includes("{"));
});
