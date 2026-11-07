import { afterEach, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
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
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Extension']");
const paneButton = (text: string) =>
  [...(pane()?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (element) => element.textContent?.trim() == text
  );

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
  (await until(() => paneButton("Show in Fields"))).click();
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

it("lists the key bindings, searchable, each command logged", async () => {
  await setup();
  const view = (name: string) =>
    [
      ...shadow().querySelectorAll<HTMLButtonElement>("[role='group'][aria-label='View'] button"),
    ].find((element) => element.textContent == name);
  // From the keyboard: the switch keeps focus (it isn't drawn anew).
  (await until(() => view("Key bindings"))).focus();
  await userEvent.keyboard("{Enter}");
  const table = await until(() => shadow().querySelector<HTMLTableElement>("table"));
  await until(() => table.querySelectorAll("tbody tr").length > 5);
  expect(shadow().activeElement).toBe(view("Key bindings"));
  // One Tab stop for the table's buttons; the arrows move between rows.
  const stops = () => [...table.querySelectorAll<HTMLButtonElement>("tbody button[tabindex='0']")];
  expect(stops()).toHaveLength(1);
  stops()[0]?.focus();
  const first = shadow().activeElement;
  await userEvent.keyboard("{ArrowDown}");
  expect(shadow().activeElement).not.toBe(first);
  expect(shadow().activeElement?.closest("tbody")).toBe(table.querySelector("tbody"));
  expect(stops()).toEqual([shadow().activeElement]);
  expect(view("Key bindings")?.getAttribute("aria-pressed")).toBe("true");
  expect(table.querySelector("tbody tr th[scope='row']")).not.toBeNull();
  const search = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the key bindings']")
  );
  await userEvent.fill(search, "selectAll");
  const rows = () => [...(shadow().querySelector("tbody")?.querySelectorAll("tr") ?? [])];
  await until(() => rows().length > 0 && rows().length < 5);
  expect(rows().every((row) => row.textContent?.includes("selectAll"))).toBe(true);
  const log = shadow().querySelector<HTMLButtonElement>("tbody button[aria-label^='Log']");
  expect(log?.getAttribute("aria-label")).toMatch(/^Log .+'s command to the console$/);
  view("Extensions")?.click();
  await until(() => tree());
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
