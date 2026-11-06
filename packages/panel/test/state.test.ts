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
    (element) => element.textContent == name
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
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
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

it("selects a whole object or array from either of its brackets", async () => {
  await setup();
  const selected = () =>
    [...shadow().querySelectorAll("[aria-label='State'] [aria-selected='true']")].map((row) =>
      row.getAttribute("data-line")
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

it("selects the whole tree with Ctrl+A, not the page, and copies what's selected", async () => {
  await setup();
  const copied: string[] = [];
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(async (text) => {
    copied.push(text);
  });
  await userEvent.click(await until(() => line("$/doc/type")));
  await userEvent.keyboard("{Control>}a{/Control}");
  await until(() => line("$")?.getAttribute("aria-selected") == "true");
  expect(line("$/doc/type")?.getAttribute("aria-selected")).toBe("true");
  expect(document.getSelection()?.toString()).toBe("");
  await userEvent.keyboard("{Control>}c{/Control}");
  await until(() => copied.length);
  expect(JSON.parse(copied[0] ?? "")).toMatchObject({ doc: { type: "Doc" } });
});

it("tabs from the tab bar straight to the State's search, not the tab panel", async () => {
  await setup();
  const logEditor = shadow().querySelector<HTMLElement>(
    "[aria-label='Log the editor to the console']"
  );
  logEditor?.focus();
  await userEvent.keyboard("{Tab}");
  expect(shadow().activeElement?.getAttribute("aria-label")).toBe("Search the state");
});

it("goes to the State's search on Ctrl+F from within its tab, selecting the query", async () => {
  await setup();
  const input = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the state']")
  );
  await userEvent.click(input);
  await userEvent.keyboard("doc");
  await userEvent.click(await until(() => line("$/doc/type")));
  expect(shadow().activeElement?.getAttribute("aria-label")).toBe("State");
  const find = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  shadow().activeElement?.dispatchEvent(find);
  expect(find.defaultPrevented).toBe(true);
  expect(shadow().activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
  // Outside the tab panel (the tab bar), the browser's own find.
  const tabBar = await until(() => tab("State"));
  tabBar.focus();
  const outside = new KeyboardEvent("keydown", {
    key: "f",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  tabBar.dispatchEvent(outside);
  expect(outside.defaultPrevented).toBe(false);
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
    () => document.querySelector("[data-wordgard-devtools-overlay]")?.textContent == "Paragraph"
  );
  // An edit takes the outline away: its path could be another node's now.
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("Oh ")] } });
  await until(() => !document.querySelector("[data-wordgard-devtools-overlay]"));
  rightClick(await until(() => line("$/doc/content/0")));
  (await until(() => item("Log to console"))).click();
  await until(() => logged.some((args) => args[0] == "[wordgard-devtools] Paragraph at range 0–7"));
  rightClick(await until(() => line("$/selection")));
  await until(() => item("Log to console"));
  expect(item("Highlight in the editor")).toBeUndefined();
  expect(item("Show in Structure")).toBeUndefined();
  (await until(() => item("Log to console"))).click();
  await until(() => logged.some((args) => args[1] == editor.state.selection));
  rightClick(await until(() => line("$/selection")));
  (await until(() => item("Log as JSON"))).click();
  await until(() =>
    logged.some(
      (args) =>
        args[0] == "[wordgard-devtools] state.toJSON().selection" &&
        args[1] != editor.state.selection
    )
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
      ?.matches("[aria-selected='true']")
  );
});

it("shows the selection under every tab, to reveal, log or copy", async () => {
  const editor = await setup();
  const bar = () => shadow().querySelector<HTMLElement>("[aria-label='Selection']");
  const barButton = (label: string) =>
    bar()?.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
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
  (await until(() => barButton("Log the selection to the console"))).click();
  await until(() => logged.some((args) => args[1] == editor.state.selection));
  (await until(() => barButton("Copy the selection's JSON"))).click();
  await until(() => copied.some((text) => text.includes('"anchor": 1')));
  (
    await until(() => barButton("Show the node holding the selection's head in the Structure"))
  ).click();
  await until(() => tab("Structure")?.getAttribute("aria-selected") == "true");
});

it("logs the state, live or as JSON, from the toolbar", async () => {
  const editor = await setup();
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  (await until(() => button("Log the state to the console"))).click();
  await until(() =>
    logged.some((args) => args[0] == "[wordgard-devtools] state" && args[1] == editor.state)
  );
  (await until(() => button("Log the state's JSON to the console"))).click();
  await until(() =>
    logged.some(
      (args) =>
        args[0] == "[wordgard-devtools] state.toJSON()" &&
        JSON.stringify(args[1]).includes('"Paragraph"')
    )
  );
});

it("searches keys and values, opening what holds the match", async () => {
  await setup();
  button("Collapse all")?.click();
  await until(() => !line("$/doc/type"));
  const input = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the state']")
  );
  await userEvent.click(input);
  await userEvent.keyboard("hi");
  // A value: its objects open, and it's focused.
  await until(() =>
    line("$/doc/content/0/content/0/param")?.className.includes("bg-yellow-500/40")
  );
  expect(line("$/doc/content/0/content/0/param")?.getAttribute("aria-selected")).toBe("true");
  expect(input.closest("div")?.textContent).toMatch(/1\/\d/);
  await userEvent.clear(input);
  await userEvent.keyboard("selection");
  // A key.
  await until(() => line("$/selection")?.className.includes("bg-yellow-500/40"));
  await userEvent.keyboard("{Escape}");
  await until(() => !line("$/selection")?.className.includes("bg-yellow-500"));
});

const panelOf = () => shadow().querySelector("[aria-label='State']")?.closest("[role='tabpanel']");
const fileInput = () => panelOf()?.querySelector<HTMLInputElement>("input[type='file']");
const pick = (file: File) => {
  const input = fileInput();
  if (!input) throw new Error("No file input");
  const files = new DataTransfer();
  files.items.add(file);
  input.files = files.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
};
const banner = () => panelOf()?.querySelector<HTMLElement>("p[role='status'], p[role='alert']");

it("downloads the state as a JSON file", async () => {
  const editor = await setup();
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    if (blob instanceof Blob) blobs.push(blob);
    return "blob:state";
  });
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const created = vi.spyOn(document, "createElement");
  (await until(() => button("Download the state as a JSON file"))).click();
  await until(() => blobs.length == 1);
  expect(clicked).toHaveBeenCalledOnce();
  const link = created.mock.results
    .map((result) => result.value)
    .find((value) => value instanceof HTMLAnchorElement);
  expect(link?.download).toMatch(/^wordgard-state-.*\.json$/);
  expect(JSON.parse(await (blobs[0] ?? new Blob()).text()).doc).toEqual(editor.state.doc.toJSON());
});

const closeButton = () => button("Close the message");
const broken = () => new File(["{not json"], "broken.json");

it("replaces the state from a file, with a banner that stays until closed", async () => {
  const editor = await setup();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const doc = {
      type: "Doc",
      content: [{ type: "Paragraph", content: [{ type: "Text", param: "Replaced" }] }],
    };
    pick(new File([JSON.stringify({ doc, selection: { type: "text", anchor: 1 } })], "state.json"));
    await vi.waitUntil(() => banner()?.getAttribute("role") == "status");
    expect(banner()?.textContent).toContain("State replaced from state.json");
    expect(banner()?.parentElement?.className).toContain("green");
    expect(editor.state.doc.textContent()).toBe("Replaced");
    // No timer closes it.
    vi.advanceTimersByTime(60_000);
    expect(banner()).not.toBeNull();
    expect(banner()?.closest("[data-closing]")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
  // The button is outside the live region: announced, it would be read out.
  expect(banner()?.querySelector("button")).toBeNull();
  await userEvent.click(await until(() => closeButton()));
  // Closing: its height eases to nothing, then it goes; focus goes to the tree.
  const closing = await until(() => banner()?.closest<HTMLElement>("[data-closing]"));
  expect(getComputedStyle(closing).transitionProperty).toContain("grid-template-rows");
  expect(shadow().activeElement?.getAttribute("aria-label")).toBe("State");
  await until(() => !banner());
  expect(shadow().activeElement?.getAttribute("aria-label")).toBe("State");
});

it("replaces a banner with the next one", async () => {
  await setup();
  pick(broken());
  await until(() => banner()?.textContent?.includes("broken.json isn't JSON"));
  pick(new File(["[1"], "other.json"));
  await until(() => banner()?.textContent?.includes("other.json isn't JSON"));
  expect(panelOf()?.querySelectorAll("p[role='alert']")).toHaveLength(1);
});

it("closes the banner when the tab is hidden", async () => {
  await setup();
  pick(broken());
  await until(() => banner());
  (await until(() => tab("Structure"))).click();
  // The tab stays mounted, hidden: the banner goes as it hides.
  await until(() => !banner());
  (await until(() => tab("State"))).click();
  await until(() => line("$/doc/type"));
  expect(banner()).toBeNull();
});

it("closes the banner when the editor changes", async () => {
  await setup();
  const second = Wordgard.create({
    parent: document.body,
    doc: "<p>Second</p>",
    config: [basicSchema(), wordgardDevtools({ name: "second" })],
  });
  try {
    pick(broken());
    await until(() => banner());
    const choose = async (second: boolean) => {
      (await until(() => shadow().querySelector<HTMLElement>("[aria-label='Editor']"))).click();
      (
        await until(() =>
          [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find(
            (option) => Boolean(option.textContent?.includes("second")) == second
          )
        )
      ).click();
    };
    await choose(true);
    await until(() => line("$/doc/content/0/content/0/param")?.textContent?.includes("Second"));
    expect(banner()).toBeNull();
    await choose(false);
    await until(() => line("$/doc/content/0/content/0/param")?.textContent?.includes("Hi"));
    expect(banner()).toBeNull();
  } finally {
    second.dom.remove();
  }
});

it("closes the banner when the panel closes", async () => {
  await setup();
  pick(broken());
  await until(() => banner());
  (await until(() => shadow().querySelector<HTMLElement>("[aria-label='Close']"))).click();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Open Wordgard DevTools']"))
  ).click();
  // Back on the State tab, the banner gone.
  await until(() => line("$/doc/type"));
  expect(banner()).toBeNull();
});

it("refuses a file that isn't a state of the schema, with a red banner", async () => {
  const editor = await setup();
  const before = editor.state.doc;
  vi.spyOn(console, "error").mockImplementation(() => {});
  pick(broken());
  await until(() => banner()?.textContent?.includes("broken.json isn't JSON"));
  expect(banner()?.getAttribute("role")).toBe("alert");
  expect(banner()?.parentElement?.className).toContain("destructive");
  const doc = {
    type: "Doc",
    content: [{ type: "Paragraph", content: [{ type: "Paragraph", content: [] }] }],
  };
  pick(new File([JSON.stringify({ doc, selection: { type: "text", anchor: 1 } })], "nested.json"));
  await until(() => banner()?.textContent?.includes("Couldn't replace the state"));
  expect(editor.state.doc).toBe(before);
});

it("scrolls a search match far down the list into view", async () => {
  // Far more lines than fit: the match is drawn only once scrolled to.
  const paragraphs = Array.from({ length: 150 }, (_, n) => `<p>p${n}</p>`).join("");
  wg = Wordgard.create({
    parent: document.body,
    doc: `${paragraphs}<p>needle</p>`,
    config: [basicSchema(), wordgardDevtools()],
  });
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("State"))).click();
  await until(() => line("$/doc/type"));
  const match = "$/doc/content/150/content/0/param";
  expect(line(match)).toBeNull();
  const input = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the state']")
  );
  await userEvent.click(input);
  await userEvent.keyboard("needle");
  const found = await until(() => line(match));
  const tree = await until(() => shadow().querySelector<HTMLElement>("[aria-label='State']"));
  await until(() => {
    const shown = found.getBoundingClientRect();
    const view = tree.getBoundingClientRect();
    return shown.top >= view.top - 0.5 && shown.bottom <= view.bottom + 0.5;
  });
  expect(tree.scrollTop).toBeGreaterThan(0);
});

it("outlines the current search match, not only by a stronger tint", async () => {
  await setup();
  const input = await until(() =>
    shadow().querySelector<HTMLInputElement>("[aria-label='Search the state']")
  );
  await userEvent.click(input);
  await userEvent.keyboard("type");
  const lines = () => [
    ...shadow().querySelectorAll<HTMLElement>("[aria-label='State'] [data-line]"),
  ];
  const current = await until(() => lines().find((l) => l.className.includes("bg-yellow-500/40")));
  const others = lines().filter((l) => l.className.includes("bg-yellow-500/20"));
  expect(others.length).toBeGreaterThan(0);
  const outline = getComputedStyle(current);
  expect([outline.outlineStyle, outline.outlineWidth, outline.outlineOffset]).toEqual([
    "solid",
    "2px",
    "-2px",
  ]);
  expect(outline.outlineColor).not.toBe("rgba(0, 0, 0, 0)");
  // Others: an outline only forced colours draw.
  for (const other of others) expect(getComputedStyle(other).outlineColor).toBe("rgba(0, 0, 0, 0)");
});
