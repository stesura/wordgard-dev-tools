import { afterEach, expect, it } from "vitest";
import { Decoration, Widget, Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import type { GardState } from "wordgard/state";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import {
  inPageTransport,
  mountDevtools,
  type MountedDevtools,
  type Transport,
} from "../src/index.ts";

// "<h1>Title</h1><p>Alpha</p>": the heading 0–7, the paragraph 7–14.
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
  const root = mounted?.host.shadowRoot;
  if (!root) throw new Error("No shadow root");
  return root;
};
const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent?.replace("(recording)", "") == name
  );
const button = (text: string) =>
  [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() == text
  );
const rows = () => [
  ...shadow().querySelectorAll<HTMLElement>("[aria-label='Transactions'] [role='option']"),
];
/** The Log's own toggle: the Structure, kept mounted, has one too. */
const logToggle = () => {
  const log = shadow().querySelector("[aria-label='Transactions']")?.closest("[role='tabpanel']");
  return [...(log?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (element) => element.textContent == "Decorations"
  );
};
const pane = () => shadow().querySelector<HTMLElement>("[aria-label='Transaction']");

const marker = Widget.define<string>({ render: (value) => document.createTextNode(value) });
// New values on each call: wasted on a flush that only moves the selection away from it.
const rebuilt = () =>
  Decoration.Point.set([[Decoration.Point.attributes({ class: "rebuilt" }), 7]]);
// Follows the selection: redrawn where the cursor was and is.
const cursor = (state: GardState) =>
  Decoration.Point.set([[Decoration.Point.widget(marker.of("|")), state.selection.head]]);

/** The in-page transport, keeping the `log` requests sent. */
const loggingTransport = () => {
  const inner = inPageTransport();
  const logs: { from: number; decorations?: boolean }[] = [];
  const transport: Transport = {
    send: (request) => {
      if (request.type == "log" && "from" in request)
        logs.push({
          from: request.from,
          decorations: "decorations" in request ? request.decorations : undefined,
        });
      return inner.send(request);
    },
    onPush: (listener) => inner.onPush(listener),
  };
  return { transport, logs };
};

const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [
      basicSchema(),
      wordgardDevtools({ name: "d" }),
      Decoration.Point.source.of(rebuilt),
      Decoration.Point.source.of(cursor),
    ],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  const { transport, logs } = loggingTransport();
  mounted = mountDevtools({ transport });
  await mounted.ready;
  (await until(() => tab("Log"))).click();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  return { editor, logs };
};

/** Selection-only flushes, each drawn. */
const moves = (editor: Wordgard, count: number) => {
  for (let i = 0; i < count; i++) {
    editor.dispatch({ selection: { anchor: 1 + (i % 4) } });
    editor.flush();
  }
};

it("asks for nothing until switched on, then reloads every row with badges and filters", async () => {
  const { editor, logs } = await setup();
  moves(editor, 2);
  await until(() => rows().length == 2);
  expect(logs.some((request) => request.decorations)).toBe(false);
  expect(shadow().querySelector("[data-decorations]")).toBeNull();
  expect(shadow().querySelector("[aria-label='Filter by decoration work']")).toBeNull();

  const before = logs.length;
  logToggle()?.click();
  await until(() => shadow().querySelectorAll("[data-decorations='wasted']").length == 2);
  expect(logs[before]).toMatchObject({ from: 0, decorations: true });
  expect(localStorage.getItem("wordgard-devtools:log-decorations")).toBe("true");

  // Two transactions in one flush: the badge on its last row only.
  editor.dispatch({ selection: { anchor: 2 } });
  editor.dispatch({ selection: { anchor: 3 } });
  editor.flush();
  await until(() => rows().length == 4 && rows()[3]?.querySelector("[data-decorations]"));
  expect(rows()[2]?.querySelector("[data-decorations]")).toBeNull();

  const filters = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Filter by decoration work']")
  );
  const chip = [...filters.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent == "stale"
  );
  chip?.click();
  await until(() => rows().length == 0);
  chip?.click();
  await until(() => rows().length == 4);
});

it("checks the flushes a limited number at a time, asking again until done", async () => {
  const { editor, logs } = await setup();
  // More flushes than the page works out per request.
  moves(editor, 105);
  await until(() => rows().length > 0);
  logToggle()?.click();
  // The panel asks again, at once, until every flush is checked.
  await until(() => logs.filter((request) => request.decorations).length >= 2);
  await until(() => !shadow().textContent?.includes("decorations checked for"));
  const asked = logs.filter((request) => request.decorations);
  expect(asked.length).toBeGreaterThanOrEqual(2);
  // The second asks again from the oldest row still pending.
  expect(asked[1]?.from).toBe(0);
});

it("shows the entry's flush, and opens a redrawn position in the Structure with decorations", async () => {
  const { editor } = await setup();
  editor.dispatch({ selection: { anchor: 3 } });
  editor.flush();
  (await until(() => rows()[0])).click();
  const section = await until(() =>
    pane()?.querySelector<HTMLElement>("[aria-label='Decorations']")
  );
  await until(() => section.textContent?.includes("Flush #1, of 1 transaction"));
  const source = (name: string) =>
    [...section.querySelectorAll<HTMLElement>("[data-flush-source]")].find((element) =>
      element.textContent?.includes(name)
    );
  expect(source("rebuilt")?.querySelector("[data-wasted]")).not.toBeNull();
  expect(source("rebuilt")?.querySelector("[data-set-verdict='recreated']")).not.toBeNull();
  expect(source("node selection")?.querySelector("[data-set-verdict='same']")).not.toBeNull();
  const link = await until(() => source("cursor")?.querySelector<HTMLButtonElement>("button"));
  link.click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
  const structure = await until(() =>
    shadow().querySelector("[aria-label='Document structure']")?.closest("[role='tabpanel']")
  );
  const toggle = [...structure.querySelectorAll("button")].find(
    (element) => element.textContent == "Decorations"
  );
  await until(() => toggle?.getAttribute("aria-pressed") == "true");
  expect(localStorage.getItem("wordgard-devtools:structure-decorations")).toBe("true");
});

it("links no position once the document has moved on", async () => {
  const { editor } = await setup();
  editor.dispatch({ selection: { anchor: 3 } });
  editor.flush();
  editor.dispatch({ changes: { from: 1, to: 2 } });
  editor.flush();
  (await until(() => rows()[0])).click();
  const section = await until(() =>
    pane()?.querySelector<HTMLElement>("[aria-label='Decorations']")
  );
  await until(() => section.textContent?.includes("no longer the editor's"));
  expect(section.querySelector("[data-flush-source] button")).toBeNull();
});
