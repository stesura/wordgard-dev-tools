import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { history } from "wordgard/history";
import { basicSchema } from "wordgard/schema";
import { RangeSet } from "wordgard/set";
import { GardState, Transaction } from "wordgard/state";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import {
  inPageTransport,
  mountDevtools,
  type MountedDevtools,
  type Transport,
} from "../src/index.ts";

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
  const root = mounted?.host?.shadowRoot;
  if (!root) throw new Error("No shadow root");
  return root;
};

// By its name, without the Log tab's "(recording)" for screen readers.
const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent?.replace("(recording)", "") == name
  );
const button = (text: string) =>
  [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() == text
  );
const row = (name: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='State fields'] [data-field='${name}']`);
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Field']");

const editorId = () => [...(window.__WORDGARD_DEVTOOLS__?.editors.values() ?? [])][0]?.id ?? 0;

/** Waits until the page tracks the editor's field changes (the panel no longer shows it). */
const tracking = async () => {
  const start = performance.now();
  for (;;) {
    const reply = await window.__WORDGARD_DEVTOOLS__?.agent?.request({
      type: "fields",
      id: editorId(),
    });
    if (reply?.ok && reply.value.tracking) return;
    if (performance.now() - start > 2000) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const bump = Transaction.Effect.define<number>();
const counter = GardState.Field.define<number>({
  create: () => 0,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(bump) ? v + e.value : v), value),
});

const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [
      basicSchema(),
      history(),
      counter,
      wordgardDevtools({ name: "f", fields: { counter } }),
    ],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  await until(() => row("counter"));
  return editor;
};

it("lists the fields and tracks their changes while shown", async () => {
  const editor = await setup();
  expect(row("counter")?.textContent).toContain("0");
  // history()'s field, by its debug name.
  expect(row("history")).not.toBeNull();
  await tracking();
  editor.dispatch({ effects: bump.of(4) });
  await until(() => row("counter")?.textContent?.startsWith("counter41"));
  row("counter")?.click();
  await until(() => pane()?.querySelector("[aria-label='History']")?.textContent?.includes("4"));
  expect(pane()?.textContent).toContain("Value4");
});

it("links a change to its transaction in the log", async () => {
  const editor = await setup();
  (await until(() => tab("Log"))).click();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  (await until(() => tab("Fields"))).click();
  editor.dispatch({ effects: bump.of(1) });
  const link = await until(() => row("counter")?.querySelector<HTMLButtonElement>("button"));
  expect(link.textContent).toBe("#0");
  link.click();
  await until(() => tab("Log")?.getAttribute("aria-selected") == "true");
  await until(() =>
    shadow().querySelector("[role='option'][aria-selected='true'][data-index='0']")
  );
});

it("stops tracking when another tab is shown", async () => {
  await setup();
  await tracking();
  (await until(() => tab("State"))).click();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const id = [...(window.__WORDGARD_DEVTOOLS__?.editors.values() ?? [])][0]?.id ?? 0;
  const reply = await window.__WORDGARD_DEVTOOLS__?.agent?.request({ type: "fields", id });
  expect(reply?.ok && reply.value.tracking).toBe(false);
});

it("tracks again when the editor reconnects under the same id", async () => {
  const editor = await setup();
  await tracking();
  editor.dom.remove();
  document.body.append(editor.dom);
  await new Promise((resolve) => setTimeout(resolve, 100));
  editor.dispatch({ effects: bump.of(2) });
  await until(() => row("counter")?.textContent?.startsWith("counter21"));
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

it("logs and copies the value from its context menu", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(4) });
  (await until(() => row("counter"))).click();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  const value = () => pane()?.querySelector<HTMLElement>("[data-field-value]");
  rightClick(await until(() => value()?.textContent == "4" && value()));
  (await until(() => item("Log to console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] counter" && args[1] == 4)
  );
  rightClick(await until(() => value()));
  (await until(() => item("Copy value"))).click();
  await until(() => copied.includes("4"));
});

it("logs a field's live value and copies it from its menu", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(4) });
  await until(() => row("counter")?.textContent?.startsWith("counter41"));
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  rightClick(await until(() => row("counter")));
  (await until(() => item("Log to console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] counter" && args[1] == 4)
  );
  // The menu selects its field.
  expect(row("counter")?.getAttribute("aria-selected")).toBe("true");
  rightClick(await until(() => row("counter")));
  (await until(() => item("Copy value"))).click();
  await until(() => copied.includes("4"));
});

it("opens no menu without fields", async () => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), wordgardDevtools()],
  });
  const inner = inPageTransport();
  const transport: Transport = {
    // The fields reply emptied in place: the editor has one field (basicSchema's).
    send: async (request) => {
      const result = await inner.send(request);
      if (
        typeof result == "object" &&
        result != null &&
        "fields" in result &&
        Array.isArray(result.fields)
      )
        result.fields.splice(0);
      return result;
    },
    onPush: (listener) => inner.onPush(listener),
  };
  mounted = mountDevtools({ transport });
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  const empty = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[aria-label='State fields'] p")].find(
      (p) => p.textContent == "No state fields found."
    )
  );
  rightClick(empty);
  // The browser's own menu, not ours.
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(shadow().querySelector("[role='menu']")).toBeNull();
});

it("clears a field's history", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(2) });
  await until(() => row("counter")?.textContent?.startsWith("counter21"));
  row("counter")?.click();
  await until(() => pane()?.querySelector("[aria-label='History'] li"));
  (
    await until(() =>
      pane()?.querySelector<HTMLButtonElement>(
        '[aria-label="Clear this field\'s history"]:not(:disabled)'
      )
    )
  ).click();
  await until(() => pane()?.textContent?.includes("No changes seen."));
  // The list's count goes too, and the value stays.
  await until(() => row("counter")?.querySelector("[data-changes]") == null);
  expect(pane()?.textContent).toContain("Value2");
});

it("expands a change in the history to the value it set, and logs or copies it from its menu", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(3) });
  editor.dispatch({ effects: bump.of(2) });
  await until(() => row("counter")?.textContent?.startsWith("counter52"));
  row("counter")?.click();
  const items = await until(() => {
    const found = [...(pane()?.querySelectorAll<HTMLElement>("[aria-label='History'] li") ?? [])];
    return found.length == 2 && found;
  });
  // Newest first: the older change set 3.
  const older = items[1];
  if (!older) throw new Error("No item");
  older.querySelector<HTMLButtonElement>("[aria-label='Expand the value']")?.click();
  await until(() => older.querySelector("pre")?.textContent == "3");
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  rightClick(older);
  (await until(() => item("Log to console"))).click();
  await until(() =>
    logged.some(
      (args) => args[0] == "[wordgard-devtools] counter, as set by a transaction" && args[1] == 3
    )
  );
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  await until(() => !shadow().querySelector("[role='menu']"));
  rightClick(older);
  (await until(() => item("Copy value"))).click();
  await until(() => copied.includes("3"));
  pane()
    ?.querySelector<HTMLButtonElement>('[aria-label="Log the history to the console"]')
    ?.click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] counter, history (newest first)")
  );
  pane()?.querySelector<HTMLButtonElement>("[aria-label='Copy the history']")?.click();
  await until(() => copied.some((text) => text.startsWith("[")));
  const history = JSON.parse(copied.find((text) => text.startsWith("[")) ?? "[]");
  expect(history.map((change: { value: unknown }) => change.value)).toEqual([5, 3]);
  older.querySelector<HTMLButtonElement>("[aria-label='Collapse the value']")?.click();
  await until(() => !older.querySelector("pre"));
});

it("selects the field selected last after a reload, if it's still there", async () => {
  await setup();
  row("counter")?.click();
  await until(() => row("counter")?.getAttribute("aria-selected") == "true");
  mounted?.unmount();
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  await until(() => row("counter")?.getAttribute("aria-selected") == "true");
  await until(() => pane()?.textContent?.includes("namecounter"));

  localStorage.setItem("wordgard-devtools:field", "gone");
  mounted.unmount();
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  await until(() => row("counter"));
  expect(shadow().querySelector("[aria-label='State fields'] [aria-selected='true']")).toBeNull();
  expect(pane()?.textContent).toContain("Select a field to see it here.");
});

it("clears every field's history at once", async () => {
  const editor = await setup();
  const clearAll = await until(() => button("Clear all"));
  expect(clearAll.disabled).toBe(true);
  await tracking();
  editor.dispatch({ effects: bump.of(2) });
  // A document change: history()'s field changes too.
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  await until(
    () => shadow().querySelectorAll("[aria-label='State fields'] [data-changes]").length >= 2
  );
  await until(() => !clearAll.disabled);
  clearAll.click();
  await until(() => !shadow().querySelector("[aria-label='State fields'] [data-changes]"));
  expect(clearAll.disabled).toBe(true);
  expect(row("counter")?.textContent).toContain("2");
});

// A comment field that forgets to map its set.
type Note = RangeSet.Value & { text: string };
const note = (text: string): Note => ({
  text,
  inclusiveStart: false,
  inclusiveEnd: false,
  eq: (other) => "text" in other && other.text == text,
});
const notes = GardState.Field.define<RangeSet<Note>>({
  create: () => RangeSet.create([[note("hi"), 1, 3]]),
  update: (set) => set,
});

it("shows a set field's entries, links them to the Structure, and flags it unmapped", async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), notes, wordgardDevtools({ name: "s", fields: { notes } })],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  (await until(() => row("notes"))).click();
  expect(row("notes")?.textContent).toContain("RangeSet(1)");
  await tracking();
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("XY")] } });
  const badge = await until(() => pane()?.querySelector<HTMLElement>("[data-set-verdict]"));
  expect(badge.dataset.setVerdict).toBe("moved");
  expect(badge.textContent).toBe("kept, not mapped");
  const entries = await until(() => pane()?.querySelector("[aria-label='Entries']"));
  expect(pane()?.textContent).toContain("RangeSet: 1 ranges");
  expect(entries.textContent).toContain('{"text":"hi"');
  [...entries.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => b.textContent == "1–3")
    ?.click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  // Position 1, before the text: the paragraph.
  await until(
    () => shadow().querySelector("[data-path='0']")?.getAttribute("aria-selected") == "true"
  );
});

const list = () => shadow().querySelector<HTMLElement>("[aria-label='State fields']");
const active = () => shadow().activeElement;
const selectedField = () =>
  list()?.querySelector("[aria-selected='true']")?.getAttribute("data-field");
const historyTree = () => pane()?.querySelector<HTMLElement>("[role='tree'][aria-label='History']");
const changes = () => [
  ...(historyTree()?.querySelectorAll<HTMLElement>("[role='treeitem']") ?? []),
];
const spyLog = () => {
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  return logged;
};
// Down from the selected field (the list focused) until it's `name`'s.
const selectByKeys = async (name: string) => {
  for (let i = 0; i < 10 && selectedField() != name; i++) await userEvent.keyboard("{ArrowDown}");
  expect(selectedField()).toBe(name);
};
it("filters the fields by a search, again as they change", async () => {
  const editor = await setup();
  const options = () =>
    [...shadow().querySelectorAll("[aria-label='State fields'] [role='option']")].map((option) =>
      option.getAttribute("data-field")
    );
  const total = options().length;
  const input = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the fields']")
  );
  await userEvent.click(input);
  await userEvent.keyboard("COUNT");
  await until(() => options().length == 1);
  expect(options()).toEqual(["counter"]);
  expect(shadow().textContent).toContain(`1 of ${total} fields`);
  // Down goes to the first field shown.
  list()?.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(selectedField()).toBe("counter");

  await userEvent.clear(input);
  await userEvent.type(input, "98765");
  await until(() => shadow().textContent?.includes("No fields match."));
  // Searched again on each load: the counter's new value matches.
  editor.dispatch({ effects: bump.of(98765) });
  await until(() => options().includes("counter"));

  await userEvent.click(input);
  await userEvent.keyboard("{Escape}");
  await until(() => options().length == total);
});

const record = async () => {
  (await until(() => tab("Log"))).click();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  (await until(() => tab("Fields"))).click();
};

it("moves through the fields with the keys, the selection following, and opens a field's menu", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(4) });
  await until(() => row("counter")?.textContent?.startsWith("counter41"));
  const fields = await until(() => list());
  const names = [...fields.querySelectorAll("[role='option']")].map((option) =>
    option.getAttribute("data-field")
  );
  // One tab stop: the list, its options reached through aria-activedescendant.
  expect(fields.tabIndex).toBe(0);
  fields.focus();
  // Nothing selected: Down goes to the first.
  await userEvent.keyboard("{ArrowDown}");
  expect(selectedField()).toBe(names[0]);
  await userEvent.keyboard("{End}");
  expect(selectedField()).toBe(names.at(-1));
  await userEvent.keyboard("{ArrowDown}");
  expect(selectedField()).toBe(names.at(-1));
  await userEvent.keyboard("{Home}{ArrowUp}");
  expect(selectedField()).toBe(names[0]);
  await selectByKeys("counter");
  expect(fields.getAttribute("aria-activedescendant")).toBe(row("counter")?.id);
  await until(() => pane()?.textContent?.includes("namecounter"));

  const logged = spyLog();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => item("Log to console"));
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] counter" && args[1] == 4)
  );
  await until(() => !shadow().querySelector("[role='menu']"));
  expect(active()).toBe(fields);
  // The ContextMenu key too; Escape gives the list focus back.
  await userEvent.keyboard("{ContextMenu}");
  await until(() => item("Copy value"));
  await userEvent.keyboard("{Escape}");
  await until(() => !shadow().querySelector("[role='menu']"));
  expect(active()).toBe(fields);
});

it("shows a field's transaction in the log from its menu, its link out of the tab order", async () => {
  const editor = await setup();
  await record();
  editor.dispatch({ effects: bump.of(1) });
  const link = await until(() => row("counter")?.querySelector<HTMLButtonElement>("button"));
  expect(link.tabIndex).toBe(-1);
  const fields = await until(() => list());
  fields.focus();
  await selectByKeys("counter");
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  (await until(() => item("Show #0 in Log"))).click();
  await until(() => tab("Log")?.getAttribute("aria-selected") == "true");
  await until(() =>
    shadow().querySelector("[role='option'][aria-selected='true'][data-index='0']")
  );
  // Focus goes to the Log's list, not <body>: the menu item that asked is gone.
  await until(() => shadow().activeElement?.getAttribute("aria-label") == "Transactions");
});

it("moves through the history with the keys, and logs a change from its menu", async () => {
  const editor = await setup();
  await record();
  editor.dispatch({ effects: bump.of(3) });
  editor.dispatch({ effects: bump.of(2) });
  (await until(() => row("counter"))).click();
  await until(() => changes().length == 2);
  // One tab stop, the newest change; the toggles and links aren't stops.
  expect(changes().map((change) => change.tabIndex)).toEqual([0, -1]);
  expect(
    [...(historyTree()?.querySelectorAll("button") ?? [])].every((b) => b.tabIndex == -1)
  ).toBe(true);
  const [newer, older] = changes();
  if (!newer || !older) throw new Error("No changes");
  newer.focus();
  await userEvent.keyboard("{ArrowDown}");
  expect(active()).toBe(older);
  expect(changes().map((change) => change.tabIndex)).toEqual([-1, 0]);
  await userEvent.keyboard("{Home}");
  expect(active()).toBe(newer);
  await userEvent.keyboard("{End}");
  expect(active()).toBe(older);

  // Right opens, then goes to the change's link; Left comes back, then closes.
  expect(older.getAttribute("aria-expanded")).toBe("false");
  await userEvent.keyboard("{ArrowRight}");
  await until(() => older.querySelector("pre")?.textContent == "3");
  expect(older.getAttribute("aria-expanded")).toBe("true");
  await userEvent.keyboard("{ArrowRight}");
  expect(active()?.textContent).toBe("#0");
  // From the link, Up goes to the change above.
  await userEvent.keyboard("{ArrowUp}");
  expect(active()).toBe(newer);
  older.focus();
  await userEvent.keyboard("{ArrowRight}{ArrowLeft}");
  expect(active()).toBe(older);
  await userEvent.keyboard("{ArrowLeft}");
  await until(() => !older.querySelector("pre"));
  // Enter and Space toggle it.
  await userEvent.keyboard("{Enter}");
  await until(() => older.querySelector("pre"));
  await userEvent.keyboard(" ");
  await until(() => !older.querySelector("pre"));

  const logged = spyLog();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => item("Log to console"));
  expect(item("Show #0 in Log")).toBeDefined();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await until(() =>
    logged.some(
      (args) => args[0] == "[wordgard-devtools] counter, as set by transaction #0" && args[1] == 3
    )
  );
  await until(() => !shadow().querySelector("[role='menu']"));
  expect(active()).toBe(older);
  // Tab leaves the history; Shift+Tab comes back to the change focused last.
  await userEvent.keyboard("{Tab}");
  expect(historyTree()?.contains(active())).toBe(false);
  await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
  expect(active()).toBe(older);
});

it("logs the value from its menu by the keyboard", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(4) });
  (await until(() => row("counter"))).click();
  const value = await until(() => {
    const found = pane()?.querySelector<HTMLElement>("[data-field-value]");
    return found?.textContent == "4" && found;
  });
  expect(value.tabIndex).toBe(0);
  value.focus();
  const logged = spyLog();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => item("Log to console"));
  await userEvent.keyboard("{ArrowDown}{Enter}");
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] counter" && args[1] == 4)
  );
  await until(() => !shadow().querySelector("[role='menu']"));
  expect(active()).toBe(value);
});

it("gives the list focus when a clear disables the button it was on", async () => {
  const editor = await setup();
  editor.dispatch({ effects: bump.of(2) });
  (await until(() => row("counter"))).click();
  await until(() => changes().length == 1);
  const clearOne = await until(() =>
    pane()?.querySelector<HTMLButtonElement>(
      '[aria-label="Clear this field\'s history"]:not(:disabled)'
    )
  );
  clearOne.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => pane()?.textContent?.includes("No changes seen."));
  expect(active()).toBe(list());

  editor.dispatch({ effects: bump.of(1) });
  const clearAll = await until(() => {
    const found = button("Clear all");
    return found && !found.disabled && found;
  });
  clearAll.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => clearAll.disabled);
  expect(active()).toBe(list());
});

it("takes a set change's badge out of the tab order, reached by Right", async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), notes, wordgardDevtools({ name: "s", fields: { notes } })],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Fields"))).click();
  (await until(() => row("notes"))).click();
  await tracking();
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("XY")] } });
  const change = await until(() => changes()[0]);
  const badge = await until(() => change.querySelector<HTMLElement>("[data-set-verdict]"));
  expect(badge.tabIndex).toBe(-1);
  change.focus();
  // Opened, then the badge.
  await userEvent.keyboard("{ArrowRight}{ArrowRight}");
  expect(active()).toBe(badge);
  await userEvent.keyboard("{ArrowLeft}");
  expect(active()).toBe(change);
});
