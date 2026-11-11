import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Decoration, Wordgard } from "wordgard/editor";
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
    (element) => element.textContent?.replace("(recording)", "") == name
  );
const tree = () => shadow().querySelector<HTMLElement>("[role='tree'][aria-label='Extensions']");
const row = (text: string) =>
  [...(tree()?.querySelectorAll<HTMLElement>("[data-extension]") ?? [])].find((element) =>
    element.textContent?.includes(text)
  );
/** A top-level row whose text starts with `text`: by facet, a facet's heading, not a value. */
const heading = (text: string) =>
  [...(tree()?.querySelectorAll<HTMLElement>("[data-extension][aria-level='1']") ?? [])].find(
    (element) => element.textContent?.startsWith(text)
  );
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Extension']");

const count = GardState.Field.define<number>({ create: () => 1, update: (v) => v });
const slot = GardState.Compartment.define();
const marks = () => Decoration.Point.set([[Decoration.Point.attributes({ class: "mark" }), 0]]);

const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Alpha</p>",
    // First: the tree draws only the rows in view.
    config: [
      count,
      slot.of(GardState.readOnly.of(false)),
      Decoration.Point.source.of(marks),
      basicSchema(),
      wordgardDevtools({ name: "x", fields: { count } }),
    ],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Extensions"))).click();
  await until(() => row("count"));
  return editor;
};

it("shows the configuration, a row's values, and reloads on a reconfigure", async () => {
  const editor = await setup();
  expect(row("compartment #")).toBeDefined();
  // A known facet: its resolved value, now.
  (await until(() => row("GardState.readOnly"))).click();
  await until(() => pane()?.textContent?.includes("resolved"));
  expect(pane()?.textContent).toContain("false");

  editor.dispatch({ effects: slot.reconfigure(GardState.readOnly.of(true)) });
  await until(() => row("compartment #")?.textContent?.includes("reconfigured"));
  await until(() => pane()?.textContent?.includes("true"));
});

it("links a field to the Fields tab, and a source's decorations to the Structure", async () => {
  await setup();
  (await until(() => row("count"))).click();
  // From the pane's context menu: its buttons are there now.
  rightClick(await until(() => pane()?.querySelector<HTMLElement>("[data-extension-detail]")));
  (await until(() => item("Show in Fields"))).click();
  await until(() => tab("Fields")?.getAttribute("aria-selected") == "true");
  await until(() =>
    shadow().querySelector(
      "[data-field='count'][aria-selected='true'], [data-field='count'].bg-accent"
    )
  );

  (await until(() => tab("Extensions"))).click();
  (await until(() => row("Decoration.Point.source"))).click();
  await until(() => pane()?.querySelector("[aria-label='Decorations'] li"));
  pane()?.querySelector<HTMLButtonElement>("[aria-label='Decorations'] li button")?.click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  expect(localStorage.getItem("wordgard-devtools:structure-decorations")).toBe("true");
});

it("moves through the tree with the keys", async () => {
  await setup();
  const element = await until(() => tree());
  element.focus();
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
  await until(() => tree()?.querySelector("[aria-selected='true']"));
  const first = tree()?.querySelector("[aria-selected='true']")?.getAttribute("data-extension");
  expect(first).toBe("0");
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await until(
    () => tree()?.querySelector("[aria-selected='true']")?.getAttribute("data-extension") == "1"
  );
  // A virtualized tree says where each row sits; the chevron isn't part of a row's name.
  const second = tree()?.querySelector("[data-extension='1']");
  expect(second?.getAttribute("aria-posinset")).toBe("2");
  expect(Number(second?.getAttribute("aria-setsize"))).toBeGreaterThan(2);
  expect(tree()?.querySelector("[role='treeitem'] button:not([aria-hidden='true'])")).toBeNull();
  expect(tree()?.getAttribute("aria-activedescendant")).toBe("extension-1");
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => !tree()?.querySelector("[aria-selected='true']"));
  expect(pane()?.textContent).toContain("Select an extension");
});

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

const keysButton = () =>
  shadow().querySelector<HTMLButtonElement>("button[aria-label='Key bindings']");
const keysPane = () => shadow().querySelector<HTMLElement>("aside[aria-label='Key bindings']");

it("lists the key bindings in a pane, searchable, each command logged", async () => {
  await setup();
  // From the keyboard: the button keeps focus, the tree stays.
  (await until(() => keysButton())).focus();
  await userEvent.keyboard("{Enter}");
  const table = await until(() => keysPane()?.querySelector<HTMLTableElement>("table"));
  await until(() => table.querySelectorAll("tbody tr").length > 5);
  expect(shadow().activeElement).toBe(keysButton());
  expect(keysButton()?.getAttribute("aria-pressed")).toBe("true");
  expect(tree()).not.toBeNull();
  // Narrow: under the extensions.
  const under = await until(() => keysPane());
  expect(under.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    tree()?.getBoundingClientRect().bottom ?? Infinity
  );
  // No buttons in the rows: one Tab stop, a row; the arrows move between rows.
  expect(table.querySelector("tbody button")).toBeNull();
  const stops = () => [...table.querySelectorAll<HTMLElement>("tbody tr[tabindex='0']")];
  expect(stops()).toHaveLength(1);
  stops()[0]?.focus();
  const first = shadow().activeElement;
  await userEvent.keyboard("{ArrowDown}");
  expect(shadow().activeElement).not.toBe(first);
  expect(shadow().activeElement?.closest("tbody")).toBe(table.querySelector("tbody"));
  expect(stops()).toEqual([shadow().activeElement]);
  expect(table.querySelector("tbody tr th[scope='row']")).not.toBeNull();
  // The menu from the keyboard, on the focused row; it logs the row's command.
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  (
    await until(() =>
      [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find((element) =>
        /^Log .+'s command$/.test(element.textContent?.trim() ?? "")
      )
    )
  ).click();
  await until(() =>
    logged.some((args) => String(args[0]).startsWith("[wordgard-devtools] key binding"))
  );
  const search = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the key bindings']")
  );
  await userEvent.fill(search, "selectAll");
  const rows = () => [...(keysPane()?.querySelector("tbody")?.querySelectorAll("tr") ?? [])];
  await until(() => rows().length > 0 && rows().length < 5);
  expect(rows().every((row) => row.textContent?.includes("selectAll"))).toBe(true);
  // Escape clears the search, then closes the pane; focus goes back to its button.
  search.focus();
  await userEvent.keyboard("{Escape}");
  expect(search.value).toBe("");
  expect(keysPane()).not.toBeNull();
  await userEvent.keyboard("{Escape}");
  await until(() => !keysPane());
  expect(shadow().activeElement).toBe(keysButton());
  expect(keysButton()?.getAttribute("aria-pressed")).toBe("false");
  // Its close button too.
  keysButton()?.click();
  (
    await until(() =>
      keysPane()?.querySelector<HTMLButtonElement>("[aria-label='Close the key bindings']")
    )
  ).click();
  await until(() => !keysPane());
});

it("sorts the key bindings by order, key or command", async () => {
  await setup();
  (await until(() => keysButton())).click();
  const table = await until(() => keysPane()?.querySelector<HTMLTableElement>("table"));
  await until(() => table.querySelectorAll("tbody tr").length > 5);
  const column = (index: number) =>
    [...(keysPane()?.querySelectorAll("tbody tr") ?? [])].map(
      (row) => row.children[index]?.textContent ?? ""
    );
  const sortBy = (name: string) =>
    keysPane()?.querySelector<HTMLButtonElement>(`thead button[aria-label='Sort by ${name}']`);
  const order = () => column(0).map(Number);
  expect(order()).toEqual(order().toSorted((a, b) => a - b));
  expect(sortBy("order")?.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
  sortBy("order")?.click();
  await until(() => order()[0] == Math.max(...order()));
  expect(sortBy("order")?.closest("th")?.getAttribute("aria-sort")).toBe("descending");
  sortBy("key")?.click();
  await until(() => sortBy("key")?.closest("th")?.getAttribute("aria-sort") == "ascending");
  expect(column(1)).toEqual(column(1).toSorted((a, b) => a.localeCompare(b)));
  sortBy("command")?.click();
  await until(() => sortBy("command")?.closest("th")?.getAttribute("aria-sort") == "ascending");
  sortBy("command")?.click();
  await until(() => sortBy("command")?.closest("th")?.getAttribute("aria-sort") == "descending");
  // Without a command ("–"), last either way.
  const commands = column(2).filter((text) => text != "–");
  expect(column(2).slice(0, commands.length)).toEqual(commands);
  const names = commands.map((text) => text.replace(/\(.*$/, ""));
  expect(names).toEqual(names.toSorted((a, b) => b.localeCompare(a)));
});

it("selects a key binding by click or keys, Enter opening its menu", async () => {
  await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  (await until(() => keysButton())).click();
  const table = await until(() => keysPane()?.querySelector<HTMLTableElement>("table"));
  await until(() => table.querySelectorAll("tbody tr").length > 5);
  // Every column has a visible heading; the pane explains itself.
  const headings = [...table.querySelectorAll("thead th")].map((th) => th.textContent?.trim());
  expect(headings.at(-1)).toBe("notes");
  expect(keysPane()?.querySelector("[aria-label='About the key bindings']")).not.toBeNull();
  const rows = () => [...table.querySelectorAll<HTMLElement>("tbody tr")];
  rows()[2]?.querySelector("td")?.click();
  await until(() => rows()[2]?.getAttribute("aria-current") == "true");
  expect(shadow().activeElement).toBe(rows()[2]);
  await userEvent.keyboard("{ArrowDown}");
  await until(() => rows()[3]?.getAttribute("aria-current") == "true");
  expect(rows().filter((row) => row.hasAttribute("aria-current"))).toHaveLength(1);
  await userEvent.keyboard("{Enter}");
  (await until(() => item("Copy key"))).click();
  await until(() => copied.length == 1);
  expect(copied[0]).toBe(rows()[3]?.querySelector("th")?.textContent);
  // Focus back on the row.
  await until(() => shadow().activeElement == rows()[3]);
});

it("puts the key bindings on the right when the tab is wide", async () => {
  await page.viewport(1400, 800);
  try {
    await setup();
    (await until(() => keysButton())).click();
    const keys = await until(() => keysPane());
    await until(() => keys.getBoundingClientRect().width > 0);
    const extension = pane()?.getBoundingClientRect();
    expect(keys.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      Math.max(tree()?.getBoundingClientRect().right ?? Infinity, extension?.right ?? 0) - 1
    );
  } finally {
    await page.viewport(414, 896);
  }
});

it("logs and copies an extension from its context menu", async () => {
  await setup();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  // The row it opens on is selected.
  rightClick(await until(() => row("count")));
  await until(() => row("count")?.getAttribute("aria-selected") == "true");
  (await until(() => item("Copy name"))).click();
  await until(() => copied.includes("count"));
  rightClick(await until(() => row("count")));
  (await until(() => item("Log to console"))).click();
  await until(() => logged.length > 0);
  rightClick(await until(() => row("count")));
  (await until(() => item("Show in Fields"))).click();
  await until(() => tab("Fields")?.getAttribute("aria-selected") == "true");
});

it("gives each panel a header, and the pane the row's menu from the keyboard", async () => {
  await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  (await until(() => row("count"))).click();
  const body = await until(() => pane()?.querySelector<HTMLElement>("[data-extension-detail]"));
  expect(pane()?.querySelector("h3")?.textContent).toBe("count");
  // Its actions are in the menu, not buttons.
  expect(pane()?.querySelector("[data-extension-detail] button")).toBeNull();
  // The tree's toolbar is in the tree's panel, beside the pane.
  expect(
    tree()?.parentElement?.querySelector("[aria-label='Search the extensions']")
  ).not.toBeNull();
  expect(pane()?.querySelector("[aria-label='Search the extensions']")).toBeNull();
  body.focus();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  (await until(() => item("Copy as JSON"))).click();
  await until(() => copied.some((text) => text.includes('"label": "count"')));
  await until(() => shadow().activeElement == body);
});

it("logs and copies a key binding from its context menu", async () => {
  await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  (await until(() => keysButton())).click();
  const search = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the key bindings']")
  );
  await userEvent.fill(search, "selectAll");
  const binding = await until(() =>
    [...(keysPane()?.querySelectorAll<HTMLElement>("tbody tr") ?? [])].find((tr) =>
      tr.textContent?.includes("selectAll")
    )
  );
  rightClick(binding);
  (await until(() => item("Copy command"))).click();
  await until(() => copied.some((text) => text.startsWith("selectAll")));
  rightClick(binding);
  expect(item("Copy key")).toBeDefined();
  expect(
    [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].some((element) =>
      /^Log .+'s command$/.test(element.textContent?.trim() ?? "")
    )
  ).toBe(true);
});

it("opens from a reconfigured entry in the Log", async () => {
  const editor = await setup();
  (await until(() => tab("Log"))).click();
  const record = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent?.trim() == "Record"
    )
  );
  record.click();
  await until(() =>
    [...shadow().querySelectorAll("button")].some((b) => b.textContent?.trim() == "Pause")
  );
  editor.dispatch({ effects: slot.reconfigure(GardState.readOnly.of(true)) });
  (
    await until(() =>
      shadow().querySelector<HTMLElement>("[aria-label='Transactions'] [role='option']")
    )
  ).click();
  const link = await until(() =>
    [
      ...(shadow()
        .querySelector("[aria-label='Transaction']")
        ?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].find((element) => element.textContent == "Show the extensions")
  );
  link.click();
  await until(() => tab("Extensions")?.getAttribute("aria-selected") == "true");
  // Focus goes to the tree, not <body>.
  await until(() => shadow().activeElement == tree());
});

it("shows a facet value's place among its facet's, and regroups the tree by facet", async () => {
  await setup();
  const order = () => pane()?.querySelector<HTMLElement>("[aria-label='Order']");
  (await until(() => row("GardState.schemaElement"))).click();
  const section = await until(() => order());
  expect(section.textContent).toMatch(/Order in GardState\.schemaElement: #1 of \d+/);
  expect(section.textContent).toContain("Joined in order.");
  expect(section.querySelector("[aria-current='true']")?.textContent).toContain("#1");
  // Another value: its row is selected, and the pane shows it.
  (await until(() => section.querySelector<HTMLButtonElement>("li button"))).click();
  await until(() => order()?.querySelector("[aria-current='true']")?.textContent?.includes("#2"));
  const second = tree()?.querySelector("[aria-selected='true']")?.textContent;
  expect(second).toMatch(/#2 of \d+/);

  const byFacet = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent == "By facet"
    )
  );
  byFacet.click();
  await until(() => byFacet.getAttribute("aria-pressed") == "true");
  // The selection follows: the same value, now under its facet.
  await until(() => tree()?.querySelector("[aria-selected='true']")?.textContent?.startsWith("#2"));
  expect(order()?.querySelector("[aria-current='true']")?.textContent).toContain("#2");
  expect(row("GardState.readOnly")?.getAttribute("aria-level")).toBe("1");
  // Its menu acts on the tree's row.
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  rightClick(await until(() => tree()?.querySelector<HTMLElement>("[aria-selected='true']")));
  (await until(() => item("Copy name"))).click();
  await until(() => copied.includes("GardState.schemaElement"));
  byFacet.click();
  await until(() => byFacet.getAttribute("aria-pressed") == "false");
  await until(() => tree()?.querySelector("[aria-selected='true']")?.textContent == second);
});

it("keeps the selected value by facet across a reconfigure that shifts the facets", async () => {
  const editor = await setup();
  const byFacet = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
      (element) => element.textContent == "By facet"
    )
  );
  byFacet.click();
  await until(() => byFacet.getAttribute("aria-pressed") == "true");
  const readOnly = await until(() => heading("GardState.readOnly"));
  const before = readOnly.getAttribute("data-extension");
  readOnly.click();
  await until(() => pane()?.textContent?.includes("Order in GardState.readOnly"));
  // A facet sorting before it: its place in the list moves down one.
  editor.dispatch({
    effects: slot.reconfigure([
      GardState.readOnly.of(true),
      Decoration.Range.source.of(() => Decoration.Range.none),
    ]),
  });
  await until(() => heading("Decoration.Range.source"));
  expect(heading("GardState.readOnly")?.getAttribute("data-extension")).not.toBe(before);
  await until(() => pane()?.textContent?.includes("Order in GardState.readOnly"));
  expect(tree()?.querySelector("[aria-selected='true']")?.textContent).toMatch(/^#1/);
});

it("closes the extension's pane, and opens it from its button or a double click", async () => {
  await setup();
  const button = () =>
    shadow().querySelector<HTMLButtonElement>("button[aria-label='Extension details']");
  expect(button()?.getAttribute("aria-pressed")).toBe("true");
  // The tree's title, before its search.
  const strip = tree()?.parentElement;
  const search = strip?.querySelector("[aria-label='Search the extensions']");
  const title = [...(strip?.querySelectorAll("h3") ?? [])].find(
    (h) => h.textContent == "Extensions"
  );
  expect(title).toBeDefined();
  expect(
    search && title && search.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_PRECEDING
  ).toBeTruthy();
  (
    await until(() =>
      pane()?.querySelector<HTMLButtonElement>("[aria-label='Close the extension details']")
    )
  ).click();
  await until(() => !pane());
  expect(shadow().activeElement).toBe(button());
  expect(button()?.getAttribute("aria-pressed")).toBe("false");
  const count = await until(() => row("count"));
  count.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  await until(() => pane()?.querySelector("h3")?.textContent == "count");
  // Escape in the pane closes it; its button opens it again.
  pane()?.querySelector<HTMLElement>("[data-extension-detail]")?.focus();
  await userEvent.keyboard("{Escape}");
  await until(() => !pane());
  button()?.click();
  await until(() => pane());
});
