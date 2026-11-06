import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import {
  inPageTransport,
  mountDevtools,
  type MountedDevtools,
  type Transport,
} from "../src/index.ts";

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

const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent == name
  );
const box = (path: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='Document structure'] [data-path='${path}']`);
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

const setup = async (transport?: Transport) => {
  wg = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), wordgardDevtools({ name: "m" })],
  });
  mounted = mountDevtools({ transport });
  await mounted.ready;
  return until(() => box("1"));
};

it("opens on a box, and from the keyboard on the focused one", async () => {
  rightClick(await setup());
  await until(() => item("Scroll into view in the page"));
  expect(item("Show Paragraph type in Schema")).toBeDefined();
  await userEvent.keyboard("{Escape}");
  await until(() => !item("Scroll into view in the page"));
  const target = await until(() => box("2"));
  target.click();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  await until(() => item("Show Paragraph type in Schema"));
  await userEvent.keyboard("{Escape}");
  await until(() => shadow().activeElement == box("2"));
});

it("scrolls the node into view and copies its path and JSON", async () => {
  const inner = inPageTransport();
  const sent: string[] = [];
  const transport: Transport = {
    send: (request) => {
      sent.push(request.type);
      return inner.send(request);
    },
    onPush: (listener) => inner.onPush(listener),
  };
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  const row = await setup(transport);
  rightClick(row);
  (await until(() => item("Scroll into view in the page"))).click();
  await until(() => sent.includes("scrollIntoView"));
  rightClick(row);
  (await until(() => item("Copy path"))).click();
  await until(() => copied.includes("[1]"));
  rightClick(row);
  (await until(() => item("Copy JSON"))).click();
  await until(() => copied.some((text) => text.includes('"type": "Paragraph"')));
});

it("shows the node's type in the Schema, and logs the node in the console", async () => {
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  const row = await setup();
  rightClick(row);
  (await until(() => item("Log to console"))).click();
  // The heading before it is 0–7.
  await until(() =>
    logged.some(
      (args) =>
        args[0] == "[wordgard-devtools] Paragraph at range 7–19" &&
        args[1] == wg?.state.doc.content[1]
    )
  );
  rightClick(row);
  (await until(() => item("Log as JSON"))).click();
  await until(() =>
    logged.some(
      (args) => JSON.stringify(args[1]) == JSON.stringify(wg?.state.doc.content[1]?.toJSON())
    )
  );
  rightClick(row);
  (await until(() => item("Show Paragraph type in Schema"))).click();
  await until(() => tab("Schema")?.getAttribute("aria-selected") == "true");
  await until(() => shadow().querySelector("[data-type='node-Paragraph']"));
});

const domLine = (id: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='View'] [data-dom='${id}']`);
const overlay = () => document.querySelector<HTMLElement>("[data-wordgard-devtools-overlay]");

it("shows a node's element in the DOM tab, a text node's parent element for a text node", async () => {
  await setup();
  rightClick(await until(() => box("1")));
  (await until(() => item("Show in DOM"))).click();
  await until(() => tab("DOM")?.getAttribute("aria-selected") == "true");
  await until(() => domLine("1")?.getAttribute("aria-selected") == "true");
  await until(() => overlay()?.textContent == "p");

  (await until(() => tab("Structure"))).click();
  rightClick(await until(() => box("2.0")));
  (await until(() => item("Show in DOM"))).click();
  await until(() => domLine("2")?.getAttribute("aria-selected") == "true");
});

it("logs a node's DOM element", async () => {
  await setup();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  rightClick(await until(() => box("1")));
  (await until(() => item("Log DOM element"))).click();
  const paragraph = wg?.contentDOM.children[1];
  await until(() =>
    logged.some(
      (args) => args[0] == "[wordgard-devtools] Paragraph's element" && args[1] == paragraph
    )
  );
  rightClick(await until(() => box("2.0")));
  (await until(() => item("Log DOM element"))).click();
  await until(() =>
    logged.some(
      (args) =>
        args[0] == "[wordgard-devtools] Text draws no element; Paragraph's" &&
        args[1] == wg?.contentDOM.children[2]
    )
  );
});
