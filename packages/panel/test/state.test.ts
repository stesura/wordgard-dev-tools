import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { GardState } from "wordgard/state";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

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
    (element) => element.textContent == name,
  );
const line = (id: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='State'] [data-line='${id}']`);
// In the State tab's panel: the Structure has buttons of the same names.
const button = (label: string) =>
  shadow()
    .querySelector("[aria-label='State']")
    ?.closest("[role='tabpanel']")
    ?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

const setup = async () => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), wordgardDevtools()],
  });
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false }),
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("State"))).click();
  await until(() => line("$/doc/type"));
  return wg;
};

it("shows the state as JSON, live", async () => {
  const editor = await setup();
  expect(line("$/doc/type")?.textContent).toBe('"type":"Doc"');
  expect(line("$/selection")?.getAttribute("aria-expanded")).toBe("true");
  expect(line("$/doc/content/0/content/0/param")?.textContent).toBe('"param":"Hi"');
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("Oh ")] } });
  await until(() => line("$/doc/content/0/content/0/param")?.textContent == '"param":"Oh Hi"');
});

it("collapses and expands, all at once or by the keyboard", async () => {
  await setup();
  button("Collapse all")?.click();
  await until(() => !line("$/doc/type"));
  expect(line("$/doc")?.textContent).toContain("2 keys");
  button("Expand all")?.click();
  await until(() => line("$/doc/type"));
  await userEvent.click(await until(() => line("$/doc")));
  await userEvent.keyboard("{ArrowLeft}");
  await until(() => !line("$/doc/type"));
  await userEvent.keyboard("{ArrowRight}");
  await until(() => line("$/doc/type"));
  await userEvent.keyboard("{ArrowDown}");
  expect(line("$/doc/type")?.getAttribute("aria-selected")).toBe("true");
});

it("moves focus to an object it closes, and into an open one with ArrowRight", async () => {
  await setup();
  await userEvent.click(await until(() => line("$/doc/content/0/type")));
  button("Collapse all")?.click();
  await until(() => line("$/doc")?.getAttribute("aria-selected") == "true");
  button("Expand all")?.click();
  await userEvent.click(await until(() => line("$/doc/type")));
  line("$/doc")?.querySelector<HTMLButtonElement>("button[aria-label='Collapse']")?.click();
  await until(() => line("$/doc")?.getAttribute("aria-selected") == "true");
  await userEvent.keyboard("{ArrowRight}");
  await until(() => line("$/doc/type"));
  await userEvent.keyboard("{ArrowRight}");
  expect(line("$/doc/type")?.getAttribute("aria-selected")).toBe("true");
});

it("keeps keys with a slash apart", async () => {
  const odd = GardState.Field.define<number>({
    create: () => 1,
    update: (v) => v,
    toJSON: () => ({ "a/b": 1, a: { b: 2 } }),
  });
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), odd, wordgardDevtools({ fields: { odd } })],
  });
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("State"))).click();
  await until(() => line("$/odd/a%2Fb"));
  expect(line("$/odd/a%2Fb")?.textContent).toBe('"a/b":1');
  expect(line("$/odd/a/b")?.textContent).toBe('"b":2');
});

const item = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(
    (element) => element.textContent?.trim() == text,
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
    }),
  );
};

it("selects a whole object or array from either of its brackets", async () => {
  await setup();
  const selected = () =>
    [...shadow().querySelectorAll("[aria-label='State'] [aria-selected='true']")].map((row) =>
      row.getAttribute("data-line"),
    );
  await userEvent.click(await until(() => line("$/doc/content/0/content#")));
  expect(selected()).toEqual([
    "$/doc/content/0/content",
    "$/doc/content/0/content/0",
    "$/doc/content/0/content/0/type",
    "$/doc/content/0/content/0/param",
    "$/doc/content/0/content/0#",
    "$/doc/content/0/content#",
  ]);
  await userEvent.click(await until(() => line("$/doc/content/0/type")));
  expect(selected()).toEqual(["$/doc/content/0/type"]);
});

it("offers highlighting for nodes only, and logs and copies any value", async () => {
  const editor = await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  // A closing bracket's menu is its object's.
  rightClick(await until(() => line("$/doc/content/0#")));
  (await until(() => item("Highlight in the editor"))).click();
  await until(
    () => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent == "Paragraph",
  );
  // An edit takes the outline away: its path could be another node's now.
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("Oh ")] } });
  await until(() => !document.querySelector("[data-wordgard-devtools-overlay]"));
  rightClick(await until(() => line("$/doc/content/0")));
  (await until(() => item("Log to console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] Paragraph at range 0–7"),
  );
  rightClick(await until(() => line("$/selection")));
  await until(() => item("Log to console"));
  expect(item("Highlight in the editor")).toBeUndefined();
  expect(item("Show in Structure")).toBeUndefined();
  (await until(() => item("Log to console"))).click();
  await until(() => logged.some((args) => args[1] == editor.state.selection));
  rightClick(await until(() => line("$/selection")));
  (await until(() => item("Log as JSON"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] state.toJSON().selection" && args[1] != editor.state.selection),
  );
  rightClick(await until(() => line("$/doc/content/0/content/0/param")));
  (await until(() => item("Copy JSON"))).click();
  await until(() => copied.includes('"Oh Hi"'));
  rightClick(await until(() => line("$/doc/content/0/content/0/param")));
  (await until(() => item("Copy path"))).click();
  await until(() => copied.includes("doc.content[0].content[0].param"));
});

it("shows a node object in the Structure", async () => {
  await setup();
  rightClick(await until(() => line("$/doc/content/0")));
  (await until(() => item("Show in Structure"))).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  await until(() =>
    shadow()
      .querySelector("[aria-label='Document structure'] [data-path='0']")
      ?.matches("[aria-selected='true']"),
  );
});

it("shows the selection under every tab, to reveal, log or copy", async () => {
  const editor = await setup();
  const bar = () => shadow().querySelector<HTMLElement>("[aria-label='Selection']");
  const barButton = (label: string) => bar()?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
  // On the State tab, not only the Structure.
  await until(() => bar()?.textContent?.includes("anchor: 1"));
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  (await until(() => barButton("Log the selection to the page's console"))).click();
  await until(() => logged.some((args) => args[1] == editor.state.selection));
  (await until(() => barButton("Copy the selection's JSON"))).click();
  await until(() => copied.some((text) => text.includes('"anchor": 1')));
  (await until(() => barButton("Show the node holding the selection's head in the Structure"))).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
});

it("logs the state, live or as JSON, from the toolbar", async () => {
  const editor = await setup();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  (await until(() => button("Log the state to the page's console"))).click();
  await until(() => logged.some((args) => args[0] == "[wordgard-devtools] state" && args[1] == editor.state));
  (await until(() => button("Log the state's JSON to the page's console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] state.toJSON()" && JSON.stringify(args[1]).includes('"Paragraph"')),
  );
});
