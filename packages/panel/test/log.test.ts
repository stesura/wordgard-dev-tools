import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { Transaction } from "wordgard/state";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools, type RequestType } from "@stesura/wordgard-dev-tools";
import {
  inPageTransport,
  mountDevtools,
  type MountedDevtools,
  type Transport,
} from "../src/index.ts";
// The rows' height, and the sticky column header's.
import { ROW } from "../src/tabs/log/log-rows.tsx";

const doc = "<h1>Title</h1><p>Alpha</p>";

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
const list = () =>
  shadow().querySelector<HTMLElement>("[role='listbox'][aria-label='Transactions']");
const rows = () => [...(list()?.querySelectorAll<HTMLElement>("[role='option']") ?? [])];
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Transaction']");

/** The in-page transport, keeping the requests sent: their type, and `from` for `log`. */
const recordingTransport = () => {
  const inner = inPageTransport();
  const sent: { type: RequestType; from?: number }[] = [];
  const transport: Transport = {
    send: (request) => {
      sent.push({ type: request.type, from: "from" in request ? request.from : undefined });
      return inner.send(request);
    },
    onPush: (listener) => inner.onPush(listener),
  };
  return { transport, sent };
};

const setup = async (transport?: Transport) => {
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), wordgardDevtools({ name: "l" })],
  });
  wg = editor;
  // Tall enough for the list above the entry pane.
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools({ transport });
  await mounted.ready;
  (await until(() => tab("Log"))).click();
  await until(() => shadow().textContent?.includes("Not recording"));
  return editor;
};

const type = (editor: Wordgard, text: string) =>
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text(text)] }, userEvent: "input.type" });

it("records transactions while recording, with their timing", async () => {
  const editor = await setup();
  type(editor, "a");
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  type(editor, "b");
  editor.dispatch({ selection: { anchor: 2 } });
  await until(() => rows().length == 2);
  const [first, second] = rows();
  expect(first?.textContent).toContain("input.type");
  expect(first?.textContent).toContain("doc");
  expect(second?.textContent).toContain("sel");
  // The flush's timing comes in after the rows.
  await until(() => rows()[0]?.querySelector("[data-flush]"));

  button("Pause")?.click();
  await until(() => button("Record"));
  type(editor, "c");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(rows()).toHaveLength(2);
});

it("shows an entry's changes, selection and annotations", async () => {
  const editor = await setup();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  // "Title" 1–6: replaces "it".
  editor.dispatch({
    changes: { from: 2, to: 4, insert: [Leaf.text("XY")] },
    selection: { anchor: 4 },
    userEvent: "input",
  });
  (await until(() => rows()[0])).click();
  const shown = await until(() => pane()?.querySelector("[data-range]"));
  expect(shown.textContent).toContain("2–4 → 2–4");
  expect(shown.textContent).toContain("it");
  expect(shown.textContent).toContain("XY");
  expect(pane()?.textContent).toContain("userEvent");
  expect(pane()?.textContent).toContain('"anchor": 4');
});

it("loads only the rows it lacks, and clears", async () => {
  const { transport, sent } = recordingTransport();
  const editor = await setup(transport);
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  type(editor, "a");
  editor.flush();
  await until(() => rows().length == 1 && rows()[0]?.querySelector("[data-flush]"));
  sent.length = 0;
  type(editor, "b");
  await until(() => rows().length == 2);
  const logs = sent.filter((r) => r.type == "log");
  expect(logs.length).toBeGreaterThan(0);
  expect(logs.every((r) => (r.from ?? 0) >= 1)).toBe(true);

  button("Clear")?.click();
  await until(() => rows().length == 0);
  type(editor, "c");
  await until(() => rows().length == 1);
  expect(rows()[0]?.textContent?.startsWith("2")).toBe(true);
});

it("copies the log as a repro from the keyboard, and says so until closed", async () => {
  const editor = await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  expect(button("Copy as repro")?.disabled).toBe(true);
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  type(editor, "a");
  const copyButton = await until(
    () => !button("Copy as repro")?.disabled && button("Copy as repro")
  );
  copyButton.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => copied.length == 1);
  expect(copied[0]).toMatch(/^\/\/ Wordgard repro: 1 transaction recorded/);
  expect(copied[0]).toContain('"userEvent":"input.type"');
  const status = await until(() => shadow().querySelector("[role='status']"));
  expect(status.textContent).toContain("Copied a Node script replaying the log");
  shadow().querySelector<HTMLElement>("[aria-label='Close the message']")?.click();
  await until(() => !shadow().querySelector("[role='status']"));
  expect(shadow().activeElement).toBe(list());
});

it("shows why a repro couldn't be copied", async () => {
  const inner = inPageTransport();
  const transport: Transport = {
    send: (request) =>
      request.type == "repro" ? Promise.reject(new Error("no luck")) : inner.send(request),
    onPush: (listener) => inner.onPush(listener),
  };
  const editor = await setup(transport);
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  type(editor, "a");
  (await until(() => !button("Copy as repro")?.disabled && button("Copy as repro"))).click();
  const alert = await until(() =>
    [...shadow().querySelectorAll("[role='alert']")].find((element) =>
      element.textContent?.includes("Couldn't copy a repro: no luck")
    )
  );
  expect(alert).toBeTruthy();
});

it("doesn't load while another tab is shown", async () => {
  const { transport, sent } = recordingTransport();
  const editor = await setup(transport);
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  (await until(() => tab("State"))).click();
  sent.length = 0;
  type(editor, "a");
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(sent.filter((r) => r.type == "log")).toEqual([]);
  (await until(() => tab("Log"))).click();
  await until(() => rows().length == 1);
});

it("shows a red dot on its tab while recording, seen from any tab", async () => {
  await setup();
  const dot = () => tab("Log")?.querySelector("[data-slot='icon']");
  expect(dot()).toBeFalsy();
  (await until(() => button("Record"))).click();
  await until(() => dot());
  expect(tab("Log")?.textContent).toContain("(recording)");
  (await until(() => tab("State"))).click();
  expect(dot()).toBeTruthy();
  (await until(() => tab("Log"))).click();
  (await until(() => button("Pause"))).click();
  await until(() => !dot());
});

it("starts over when the editor reconnects with a new log", async () => {
  const editor = await setup();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  type(editor, "a");
  await until(() => rows().length == 1);
  // Same instance, same id: the page dropped its log.
  editor.dom.remove();
  document.body.append(editor.dom);
  await until(() => button("Record") && rows().length == 0);
});

const note = Transaction.Annotation.define<string>();

const record = async () => {
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
};

/** The rows' indices, in the order shown. */
const order = () => rows().map((row) => Number(row.getAttribute("data-index")));

it("disables the filters while there are no transactions", async () => {
  const editor = await setup();
  const bar = await until(() =>
    shadow().querySelector<HTMLElement>("[role='group'][aria-label='Filters']")
  );
  // The guide's button stays enabled.
  const filters = () =>
    bar.querySelectorAll<HTMLButtonElement>("button:not([aria-label='About the filters'])");
  expect([...filters()].every((b) => b.disabled || b.hasAttribute("data-disabled"))).toBe(true);
  await record();
  type(editor, "a");
  await until(() => rows().length == 1);
  await until(() => [...filters()].every((b) => !b.disabled));
});

it("counts every annotation in the table, as the entry does", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  const row = await until(() => rows()[0]);
  // The time stamp and the user event.
  expect(row.children[5]?.textContent).toBe("2");
  row.click();
  await until(() => pane()?.textContent?.includes("Annotations (2)"));
});

it("filters by user event, what changed and annotation", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  editor.dispatch({ selection: { anchor: 2 }, userEvent: "select.pointer" });
  editor.dispatch({ selection: { anchor: 1 }, annotations: note.of("n") });
  await until(() => rows().length == 3);

  // What changed: every flag on at first; one switched off hides the rows that only have it.
  const changed = () => [
    ...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by what changed'] button"),
  ];
  expect(changed().map((b) => b.textContent)).toEqual(["doc", "sel", "focus", "app"]);
  expect(changed().map((b) => b.getAttribute("aria-pressed"))).toEqual([
    "true",
    "true",
    "true",
    "true",
  ]);
  changed()
    .find((b) => b.textContent == "sel")
    ?.click();
  await until(() => order().join() == "0");
  changed()
    .find((b) => b.textContent == "sel")
    ?.click();
  changed()
    .find((b) => b.textContent == "doc")
    ?.click();
  await until(() => order().join() == "1,2");

  // A custom annotation, listed by its number.
  const annotation = await until(() =>
    [
      ...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by annotation'] button"),
    ].find((b) => b.textContent?.startsWith("annotation #"))
  );
  annotation.click();
  await until(() => order().join() == "2");
  expect(shadow().textContent).toContain("1 of 3 transactions");
  button("Clear filters")?.click();
  await until(() => rows().length == 3);

  // User events: a checkbox each, all ticked at first.
  const trigger = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Filter by user event']")
  );
  expect(trigger.textContent).toContain("all");
  trigger.click();
  // Base UI's checkboxes: role="checkbox", aria-checked "true", "false" or "mixed".
  const box = (text: string) =>
    [...shadow().querySelectorAll("label")]
      .find((l) => l.textContent == text)
      ?.querySelector<HTMLElement>("[role='checkbox']");
  const all = await until(() => box("All"));
  expect(
    [...shadow().querySelectorAll("[aria-label='User events'] label")].map((l) => l.textContent)
  ).toEqual(["input.type", "select.pointer", "none"]);
  (await until(() => box("input.type"))).click();
  await until(() => order().join() == "1,2");
  expect(all.getAttribute("aria-checked")).toBe("mixed");
  expect(trigger.textContent).toContain("2 of 3");
  // Some unticked: All ticks them all.
  all.click();
  await until(() => rows().length == 3);
  expect(all.getAttribute("aria-checked")).toBe("true");
  // All ticked: All unticks them all.
  all.click();
  await until(() => rows().length == 0);
  expect(trigger.textContent).toContain("none");
  (await until(() => box("select.pointer"))).click();
  await until(() => order().join() == "1");
  expect(trigger.textContent).toContain("select.pointer");
});

it("sorts by a column, ascending then descending", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  editor.dispatch({ selection: { anchor: 2 }, annotations: note.of("n") });
  editor.dispatch({ selection: { anchor: 1 } });
  await until(() => rows().length == 3);
  const sortBy = (label: string) =>
    shadow().querySelector<HTMLButtonElement>(`[aria-label='Sort by ${label}']`);
  sortBy("index")?.click();
  await until(() => order().join() == "2,1,0");
  sortBy("annotations")?.click();
  // Ascending, ties in log order: 2 has only the time stamp.
  await until(() => order().join() == "2,0,1");
  sortBy("annotations")?.click();
  await until(() => order().join() == "0,1,2");
});

it("sorts by user event (none last either way) and by what changed", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  editor.dispatch({ selection: { anchor: 1 }, userEvent: "delete" });
  editor.dispatch({ selection: { anchor: 2 } });
  await until(() => rows().length == 3);
  const sortBy = (label: string) =>
    shadow().querySelector<HTMLButtonElement>(`[aria-label='Sort by ${label}']`);
  sortBy("user event")?.click();
  await until(() => order().join() == "1,0,2");
  sortBy("user event")?.click();
  await until(() => order().join() == "0,1,2");
  // Ascending: selection only, then document and selection.
  sortBy("changed")?.click();
  await until(() => order().join() == "1,2,0");
});

it("skips select.pointer transactions when its box is unticked, and remembers it", async () => {
  const editor = await setup();
  await record();
  const box = await until(() =>
    [...shadow().querySelectorAll("label")]
      .find((l) => l.textContent?.includes("record select.pointer"))
      ?.querySelector<HTMLElement>("[role='checkbox']")
  );
  expect(box.getAttribute("aria-checked")).toBe("true");
  box.click();
  await until(() => localStorage.getItem("wordgard-devtools:log-select-pointer") == "false");
  editor.dispatch({ selection: { anchor: 2 }, userEvent: "select.pointer" });
  type(editor, "a");
  await until(() => rows().length == 1);
  expect(rows()[0]?.textContent).toContain("input.type");
});

it("flags focus changes, and hides them with their filter", async () => {
  const editor = await setup();
  await record();
  editor.dispatch({ annotations: Wordgard.isFocusChange.of(false) });
  type(editor, "a");
  await until(() => rows().length == 2);
  expect(rows()[0]?.textContent).toContain("focus");
  [...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by what changed'] button")]
    .find((b) => b.textContent == "focus")
    ?.click();
  await until(() => order().join() == "1");
});

it("skips focus changes when its box is unticked, and remembers it", async () => {
  const editor = await setup();
  await record();
  const box = await until(() =>
    [...shadow().querySelectorAll("label")]
      .find((l) => l.textContent?.includes("record focus"))
      ?.querySelector<HTMLElement>("[role='checkbox']")
  );
  expect(box.getAttribute("aria-checked")).toBe("true");
  box.click();
  await until(() => localStorage.getItem("wordgard-devtools:log-focus-changes") == "false");
  editor.dispatch({ annotations: Wordgard.isFocusChange.of(false) });
  type(editor, "a");
  await until(() => rows().length == 1);
  expect(rows()[0]?.textContent).toContain("input.type");
});

it("reads the saved select.pointer setting back, and records with it", async () => {
  localStorage.setItem("wordgard-devtools:log-select-pointer", "false");
  const editor = await setup();
  const box = await until(() =>
    [...shadow().querySelectorAll("label")]
      .find((l) => l.textContent?.includes("record select.pointer"))
      ?.querySelector<HTMLElement>("[role='checkbox']")
  );
  expect(box.getAttribute("aria-checked")).toBe("false");
  await record();
  editor.dispatch({ selection: { anchor: 2 }, userEvent: "select.pointer" });
  type(editor, "a");
  await until(() => rows().length == 1);
  expect(rows()[0]?.textContent).toContain("input.type");
});

it("shows the what-changed toggles' tooltips", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  await until(() => rows().length == 1);
  const doc = await until(() =>
    [
      ...shadow().querySelectorAll<HTMLButtonElement>(
        "[aria-label='Filter by what changed'] button"
      ),
    ].find((b) => b.textContent == "doc")
  );
  await userEvent.hover(doc);
  await until(() =>
    [...shadow().querySelectorAll("[data-slot='tooltip-content']")].some((t) =>
      t.textContent?.startsWith("Changed the document")
    )
  );
});

const menuItem = (text: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='menuitem']")].find(
    (element) => element.textContent?.trim() == text
  );

const openMenu = async (element: HTMLElement) => {
  await until(() => !shadow().querySelector("[role='menu']"));
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

it("logs a transaction or copies it as JSON or text from a row's menu", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  const row = await until(() => rows()[0]);
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  await openMenu(row);
  // The menu selects its row.
  await until(() => row.getAttribute("aria-selected") == "true");
  (await until(() => menuItem("Log to console"))).click();
  await until(() =>
    logged.some(
      (args) => args[0] == "[wordgard-devtools] transaction #0" && args[1] instanceof Transaction
    )
  );
  await openMenu(row);
  (await until(() => menuItem("Copy as JSON"))).click();
  await until(() =>
    copied.some((text) => text.startsWith("{") && JSON.parse(text).userEvent == "input.type")
  );
  await openMenu(row);
  (await until(() => menuItem("Copy as text"))).click();
  await until(() =>
    copied.some((text) => text.startsWith("#0\t") && text.includes("\tinput.type\t"))
  );
});

it("logs or copies each part of an entry from its menu", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  (await until(() => rows()[0])).click();
  const part = (title: string) =>
    pane()?.querySelector<HTMLElement>(`section[aria-label^='${title}']`);
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  await openMenu(await until(() => part("Changes")));
  (await until(() => menuItem("Log to console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] transaction #0, changes")
  );
  await openMenu(await until(() => part("Selection")));
  (await until(() => menuItem("Copy as JSON"))).click();
  await until(() => copied.some((text) => "before" in JSON.parse(text)));
  await openMenu(await until(() => part("Transaction")));
  (await until(() => menuItem("Log to console"))).click();
  await until(() =>
    logged.some(
      (args) => args[0] == "[wordgard-devtools] transaction #0" && args[1] instanceof Transaction
    )
  );
});

it("saves the filters, but not unnamed annotations, and reads them back", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  editor.dispatch({ selection: { anchor: 1 }, annotations: note.of("n") });
  await until(() => rows().length == 2);
  const changed = (name: string) =>
    [
      ...shadow().querySelectorAll<HTMLButtonElement>(
        "[aria-label='Filter by what changed'] button"
      ),
    ].find((b) => b.textContent == name);
  const annotation = (start: string) =>
    [
      ...shadow().querySelectorAll<HTMLButtonElement>("[aria-label='Filter by annotation'] button"),
    ].find((b) => b.textContent?.startsWith(start));
  changed("sel")?.click();
  annotation("userEvent")?.click();
  annotation("annotation #")?.click();
  await until(() => annotation("annotation #")?.getAttribute("aria-pressed") == "true");
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:log-filters") ?? "null")).toEqual({
    events: [],
    hidden: ["sel"],
    annotations: ["userEvent"],
  });
  mounted?.unmount();
  wg?.dom.remove();

  localStorage.setItem(
    "wordgard-devtools:log-filters",
    JSON.stringify({ events: ["input.type"], hidden: ["doc", "bogus"], annotations: ["remote"] })
  );
  const again = await setup();
  // Saved, though no row has it yet: listed, pressed, so it can be switched off.
  await until(() => annotation("remote")?.getAttribute("aria-pressed") == "true");
  expect(changed("doc")?.getAttribute("aria-pressed")).toBe("false");
  expect(changed("sel")?.getAttribute("aria-pressed")).toBe("true");
  // input.type unticked: a typed row is hidden.
  await record();
  type(again, "b");
  await until(() => shadow().textContent?.includes("No transactions match the filters"));
});

// The Log's scroller: the list and its sticky column header scroll in it.
const logScroller = () => {
  let element = list()?.parentElement ?? null;
  while (element && getComputedStyle(element).overflowY != "auto") element = element.parentElement;
  return element;
};
const drawnRow = (index: number) =>
  list()?.querySelector<HTMLElement>(`[data-index='${index}']`) ?? null;
// Row indices count across the page's whole log, and the log may hold more than the test's rows.
const drawnIndices = () =>
  [...(list()?.querySelectorAll("[data-index]") ?? [])].map((row) =>
    Number(row.getAttribute("data-index"))
  );
const newestDrawn = () => Math.max(...drawnIndices());
const oldestDrawn = () => Math.min(...drawnIndices());
// Below the sticky header and above the scroller's bottom.
const inView = (row: HTMLElement, scroller: HTMLElement) => {
  const shown = row.getBoundingClientRect();
  const view = scroller.getBoundingClientRect();
  return shown.top >= view.top + ROW - 0.5 && shown.bottom <= view.bottom + 0.5;
};
// Following scrolls to the bottom; its scroll event comes a frame later.
const followed = async (scroller: HTMLElement) => {
  await until(
    () => Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) <= 1
  );
  for (let n = 0; n < 2; n++) await new Promise((resolve) => requestAnimationFrame(resolve));
};
const recordMany = async (editor: Wordgard, count: number) => {
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  for (let n = 0; n < count; n++) type(editor, "x");
  const scroller = await until(logScroller);
  await until(() => scroller.scrollHeight >= (count + 1) * ROW);
  return scroller;
};

it("follows new rows while scrolled to the bottom, and stays put once scrolled up", async () => {
  const editor = await setup();
  const scroller = await recordMany(editor, 80);
  await followed(scroller);
  const newest = newestDrawn();

  scroller.scrollTop = 0;
  await new Promise((resolve) => setTimeout(resolve, 50));
  for (let n = 0; n < 5; n++) type(editor, "y");
  await until(() => scroller.scrollHeight >= 86 * ROW);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(scroller.scrollTop).toBe(0);
  const oldest = drawnRow(oldestDrawn());
  expect(oldest && inView(oldest, scroller)).toBe(true);
  expect(drawnRow(newest + 5)).toBeNull();
});

it("scrolls the row the keyboard selects into view, below the header", async () => {
  const editor = await setup();
  const scroller = await recordMany(editor, 80);
  await followed(scroller);
  const newest = newestDrawn();
  scroller.scrollTop = 0;
  await until(() => drawnRow(newest) == null);
  const oldest = oldestDrawn();
  await userEvent.click(await until(() => drawnRow(oldest)));
  await userEvent.keyboard("{End}");
  const last = await until(() => drawnRow(newest));
  await until(() => last.getAttribute("aria-selected") == "true" && inView(last, scroller));
  await userEvent.keyboard("{Home}");
  const first = await until(() => drawnRow(oldest));
  await until(() => first.getAttribute("aria-selected") == "true" && inView(first, scroller));
  expect(scroller.scrollTop).toBe(0);
});

/** Runs `run` with every clock reading 20 ms on from the last: what it times is slow. */
const slowly = (run: () => void) => {
  let now = performance.now();
  const clock = vi.spyOn(performance, "now").mockImplementation(() => (now += 20));
  try {
    run();
  } finally {
    clock.mockRestore();
  }
};

const valueOf = (label: string) =>
  [...(pane()?.querySelectorAll<HTMLElement>("[data-value]") ?? [])].find(
    (value) => value.previousElementSibling?.textContent == label
  );

it("marks a slow timing by more than its colour: a sign, bold, and read as slow", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  editor.flush();
  slowly(() => {
    type(editor, "b");
    editor.flush();
  });
  await until(() => rows().length == 2 && rows()[1]?.querySelector("[data-flush]"));
  const [fast, slow] = rows();
  if (!fast || !slow) throw new Error("No rows");
  const [dispatch, flush] = [...slow.children].slice(-2);
  if (!(dispatch instanceof HTMLElement) || !(flush instanceof HTMLElement))
    throw new Error("No timings");
  for (const cell of [dispatch, flush]) {
    expect(cell.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(cell.textContent).toContain(", slow");
    const value = cell.querySelector<HTMLElement>(".font-semibold");
    expect(value && getComputedStyle(value).fontWeight).toBe("600");
  }
  // Its name replaces its content.
  expect(flush.getAttribute("aria-label")).toMatch(/^\d+\.\d ms, slow, Flush #\d+$/);
  expect(fast.querySelector("svg")).toBeNull();
  expect(fast.textContent).not.toContain("slow");
  expect(fast.querySelector("[data-flush]")?.getAttribute("aria-label")).not.toContain("slow");

  slow.click();
  const shown = await until(() => valueOf("flush")?.querySelector("svg") && valueOf("dispatch"));
  for (const value of [shown, valueOf("flush")]) {
    expect(value?.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(value?.textContent).toMatch(/\d ms, slow/);
  }
  fast.click();
  await until(() => !valueOf("dispatch")?.textContent?.includes("slow"));
  expect(valueOf("flush")?.querySelector("svg")).toBeNull();
});

it("marks the selected bar in the timeline below it, not by its shade alone", async () => {
  const editor = await setup();
  await record();
  type(editor, "a");
  type(editor, "b");
  await until(() => rows().length == 2);
  const markers = () =>
    [...shadow().querySelectorAll("[data-selected-marker]")].map((marker) =>
      marker.parentElement?.getAttribute("data-bar")
    );
  expect(markers()).toEqual([]);
  rows()[1]?.click();
  await until(() => markers().length == 1);
  expect(markers()).toEqual([rows()[1]?.getAttribute("data-index")]);
  const marker = shadow().querySelector("[data-selected-marker]");
  // A border, which forced colours keep.
  expect(marker && getComputedStyle(marker).borderTopWidth).toBe("2px");
});

it("wraps its toolbar when narrow: the recording settings under the rest, the count unbroken", async () => {
  const { innerWidth: width, innerHeight: height } = window;
  await setup();
  const record = await until(() =>
    [...shadow().querySelectorAll("button")].find((b) => b.textContent?.trim() == "Record")
  );
  const strip = record.parentElement;
  const find = (text: string) =>
    until(() =>
      [...(strip?.querySelectorAll("button, label, span") ?? [])].find(
        (element) => element.textContent?.trim() == text
      )
    );
  const count = await until(() => strip?.querySelector("[aria-live]"));
  const decorations = await find("Decorations");
  const focus = await find("record focus");
  const rect = (element: Element) => element.getBoundingClientRect();
  try {
    await page.viewport(1100, height);
    await until(() => rect(focus).top < rect(record).bottom);
    await page.viewport(560, height);
    await until(() => rect(focus).top >= rect(record).bottom);
    expect(rect(decorations).top).toBeLessThan(rect(record).bottom);
    // On one line, and at the right of its own.
    expect(rect(count).height).toBeLessThan(20);
    expect(Math.round(rect(focus).right)).toBeGreaterThan(
      Math.round(rect(strip ?? focus).right) - 40
    );
    await page.viewport(340, height);
    expect(rect(count).height).toBeLessThan(20);
  } finally {
    await page.viewport(width, height);
  }
});
