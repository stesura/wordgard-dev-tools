import { afterEach, expect, it, vi } from "vitest";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { history } from "wordgard/history";
import { basicSchema } from "wordgard/schema";
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
  const root = mounted?.host.shadowRoot;
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
  expect(row("field #1")).not.toBeNull();
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
    ?.querySelector<HTMLButtonElement>('[aria-label="Log the history to the page\'s console"]')
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
