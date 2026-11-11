import { afterEach, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { Leaf } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { inPageTransport, mountDevtools, type MountedDevtools } from "../src/index.ts";

const editors: Wordgard[] = [];
let mounted: MountedDevtools | null = null;
/** More handles a test holds; released after it. */
const handles: MountedDevtools[] = [];

const open = (name: string, doc: string) => {
  const wg = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), wordgardDevtools({ name })],
  });
  editors.push(wg);
  return wg;
};

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  for (const handle of handles.splice(0)) handle.unmount();
  for (const wg of editors.splice(0)) wg.dom.remove();
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

const text = () => shadow().textContent ?? "";

const entryOf = (wg: Wordgard) => window.__WORDGARD_DEVTOOLS__?.editors.get(wg);

it("mounts in a shadow root and attaches the first editor", async () => {
  const a = open("first", "<p>Alpha</p>");
  open("second", "<p>Beta</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => text().includes("Alpha"));
  expect(text()).toContain("2 editors");
  expect(entryOf(a)?.attached).toBe(true);
  // Styles are adopted by the shadow root, not added to the page.
  expect(shadow().adoptedStyleSheets.length).toBe(1);
  expect(document.head.querySelector("style[data-vite-dev-id*='styles.css']")).toBeNull();
});

it("follows the attached editor's updates and switches editors", async () => {
  const a = open("first", "<p>Alpha</p>");
  const b = open("second", "<p>Beta</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => text().includes("Alpha"));

  a.dispatch({ changes: { from: 1, insert: [Leaf.text("Live ")] } });
  await until(() => text().includes("Live Alpha"));

  const trigger = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Editor']"));
  trigger.click();
  const option = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find((o) =>
      o.textContent?.includes("second")
    )
  );
  option.click();
  await until(() => text().includes("Beta"));
  expect(entryOf(a)?.attached).toBe(false);
  expect(entryOf(b)?.attached).toBe(true);
});

it("lists editors that connect after it mounted", async () => {
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => text().includes("No editors"));
  open("late", "<p>Late</p>");
  await until(() => text().includes("Late"));
});

it("collapses to a button and detaches", async () => {
  const a = open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => entryOf(a)?.attached);
  const collapse = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Close']"));
  collapse.click();
  const expand = await until(() =>
    [...shadow().querySelectorAll("button")].find(
      (button) => button.textContent == "Wordgard DevTools"
    )
  );
  await until(() => entryOf(a)?.attached === false);
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:dock") ?? "{}")).toMatchObject({
    collapsed: true,
  });
  expand.click();
  await until(() => entryOf(a)?.attached);
});

it("detaches on unmount", async () => {
  const a = open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => entryOf(a)?.attached);
  mounted.unmount();
  mounted = null;
  await until(() => entryOf(a)?.attached === false);
  expect(document.querySelector("wordgard-devtools")).toBeNull();
});

const hosts = () => document.querySelectorAll("wordgard-devtools").length;

const mount = (options?: Parameters<typeof mountDevtools>[0]) => {
  const handle = mountDevtools(options);
  handles.push(handle);
  return handle;
};

it("shares one dock between calls, until the last handle unmounts", async () => {
  const a = mount();
  const b = mount();
  expect(b.host).toBe(a.host);
  expect(hosts()).toBe(1);
  await b.ready;
  expect(b.host?.shadowRoot?.childElementCount).toBeGreaterThan(0);
  a.unmount();
  expect(a.host?.isConnected).toBe(true);
  b.unmount();
  expect(hosts()).toBe(0);
});

it("leaves one dock after mount, unmount, mount, and cancels the first render", async () => {
  const a = mount();
  a.unmount();
  const b = mount();
  expect(b.host).not.toBe(a.host);
  await Promise.all([a.ready, b.ready]);
  expect(hosts()).toBe(1);
  expect(a.host?.shadowRoot?.childElementCount).toBe(0);
  expect(b.host?.shadowRoot?.childElementCount).toBeGreaterThan(0);
});

it("releases one reference per handle, however often it's unmounted", () => {
  const a = mount();
  const b = mount();
  a.unmount();
  a.unmount();
  expect(b.host?.isConnected).toBe(true);
  b.unmount();
  expect(hosts()).toBe(0);
});

it("neither counts nor mounts a disabled call", () => {
  const off = mount({ enabled: false });
  expect(hosts()).toBe(0);
  const a = mount();
  const offToo = mount({ enabled: false });
  expect(offToo.host).not.toBe(a.host);
  expect(offToo.host?.isConnected).toBe(false);
  off.unmount();
  offToo.unmount();
  expect(a.host?.isConnected).toBe(true);
  a.unmount();
  expect(hosts()).toBe(0);
});

it("keeps the dock, and warns once, when a call asks for another parent or transport", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const a = mount();
  const elsewhere = document.createElement("div");
  document.body.append(elsewhere);
  try {
    expect(mount({ parent: elsewhere }).host).toBe(a.host);
    expect(mount({ transport: inPageTransport() }).host).toBe(a.host);
    expect(mount({ parent: document.body }).host).toBe(a.host);
    expect(a.host?.parentElement).toBe(document.body);
    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    elsewhere.remove();
  }
});

it("waits for the body when called before it exists", () => {
  const noBody = vi.spyOn(document, "querySelector").mockReturnValue(null);
  const early = mount();
  const dropped = mountDevtools({ enabled: false });
  expect(early.host?.isConnected).toBe(false);
  noBody.mockRestore();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  expect(early.host?.parentElement).toBe(document.body);
  expect(dropped.host?.isConnected).toBe(false);
});

it("stays out of the page when unmounted before the body exists", () => {
  const noBody = vi.spyOn(document, "querySelector").mockReturnValue(null);
  const early = mountDevtools();
  early.unmount();
  noBody.mockRestore();
  document.dispatchEvent(new Event("DOMContentLoaded"));
  expect(hosts()).toBe(0);
});

it("follows the picked editor through a remount", async () => {
  open("first", "<p>Alpha</p>");
  const b = open("second", "<p>Beta</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => text().includes("Alpha"));
  const trigger = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Editor']"));
  trigger.click();
  const option = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='option']")].find((o) =>
      o.textContent?.includes("second")
    )
  );
  option.click();
  await until(() => text().includes("Beta"));
  b.dom.remove();
  await until(() => text().includes("Alpha"));
  const again = open("second", "<p>Beta again</p>");
  await until(() => text().includes("Beta again"));
  expect(entryOf(again)?.attached).toBe(true);
});

/** Through the Dock menu. */
const dockTo = async (side: string) => {
  (await until(() => shadow().querySelector<HTMLElement>("[aria-label^='Dock: ']"))).click();
  const item = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='menuitemradio']")].find(
      (element) => element.textContent == side
    )
  );
  item.click();
};

const savedDock = () => JSON.parse(localStorage.getItem("wordgard-devtools:dock") ?? "{}");

const mountDock = async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  const dock = await until(() => shadow().querySelector<HTMLElement>("[role='region']"));
  const handle = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Resize Wordgard DevTools']")
  );
  return { dock, handle };
};

it("resizes from the keyboard, by 20 px, and remembers it", async () => {
  const { dock, handle } = await mountDock();
  expect(dock.style.height).toBe("280px");
  handle.focus();
  await userEvent.keyboard("{ArrowUp}{ArrowUp}");
  expect(dock.style.height).toBe("320px");
  expect(savedDock()).toMatchObject({ side: "bottom", size: 320 });
  await userEvent.keyboard("{ArrowDown}");
  expect(dock.style.height).toBe("300px");
  expect(savedDock()).toMatchObject({ size: 300 });
});

it("resizes as it's dragged, and saves the size when the drag ends", async () => {
  const { dock, handle } = await mountDock();
  // Synthetic pointers can't be captured.
  vi.spyOn(Element.prototype, "setPointerCapture").mockImplementation(() => {});
  const pointer = (type: string, clientY: number) =>
    handle.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 10, clientY })
    );
  pointer("pointerdown", 500);
  pointer("pointermove", 440);
  await until(() => dock.style.height == "340px");
  expect(savedDock().size).toBeUndefined();
  pointer("pointerup", 420);
  await until(() => dock.style.height == "360px");
  expect(savedDock()).toMatchObject({ size: 360 });
});

it("keeps a saved size within the window", async () => {
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({ side: "bottom", size: 99999 }));
  const big = await mountDock();
  expect(big.dock.style.height).toBe(`${window.innerHeight - 40}px`);
  mounted?.unmount();
  for (const wg of editors.splice(0)) wg.dom.remove();
  localStorage.setItem("wordgard-devtools:dock", JSON.stringify({ side: "bottom", size: 10 }));
  const small = await mountDock();
  expect(small.dock.style.height).toBe("120px");
});

it("switches the theme from its menu", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => shadow().querySelector<HTMLElement>("[aria-label^='Theme: ']"))).click();
  const dark = await until(() =>
    [...shadow().querySelectorAll<HTMLElement>("[role='menuitemradio']")].find(
      (element) => element.textContent == "Dark"
    )
  );
  dark.click();
  await until(() => shadow().querySelector("[aria-label='Theme: Dark']"));
  expect(shadow().querySelector(".dark")).not.toBeNull();
});

it("docks on any side, and remembers it", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  const dock = await until(() => shadow().querySelector<HTMLElement>("[role='region']"));
  expect(dock.dataset.side).toBe("bottom");
  expect(shadow().textContent).not.toContain("protocol");
  await dockTo("Right");
  const right = await until(() => shadow().querySelector<HTMLElement>("[data-side='right']"));
  expect(right.getBoundingClientRect().right).toBe(window.innerWidth);
  // 420 px, or the viewport less 40 when narrower.
  const width = Math.min(420, window.innerWidth - 40);
  expect(right.style.width).toBe(`${width}px`);
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:dock") ?? "{}")).toMatchObject({
    side: "right",
    size: width,
  });
  await dockTo("Top");
  const top = await until(() => shadow().querySelector<HTMLElement>("[data-side='top']"));
  expect(top.getBoundingClientRect().top).toBe(0);
});

it("pauses: the editor is detached and the panel shows it, until resumed", async () => {
  const editor = open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => entryOf(editor)?.attached);
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pause the devtool']"))
  ).click();
  await until(() => !entryOf(editor)?.attached);
  const resume = await until(() =>
    [...shadow().querySelectorAll<HTMLButtonElement>("button")].find((b) =>
      b.textContent?.includes("The devtool is paused")
    )
  );
  resume.click();
  await until(() => entryOf(editor)?.attached);
  expect(shadow().textContent).not.toContain("The devtool is paused");
});

it("switches tabs from the keyboard", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  const tabs = await until(() => {
    const found = [...shadow().querySelectorAll<HTMLElement>("[role='tab']")];
    return found.length > 0 && found;
  });
  tabs[0]?.focus();
  await userEvent.keyboard("{ArrowRight}");
  expect(shadow().activeElement?.textContent).toBe("Selection");
  await userEvent.keyboard("{Enter}");
  await until(() => tabs[1]?.getAttribute("aria-selected") == "true");
  // One tab stop: the selected tab.
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1, -1, -1]);
});

it("puts the title on its own row when docked at a side, and keeps every tab visible", async () => {
  open("first", "<p>Alpha</p>");
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "right", size: 260, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  const title = await until(() =>
    [...shadow().querySelectorAll("div")].find((d) => d.textContent == "Wordgard DevTools")
  );
  expect(title.className).toContain("bg-muted");
  const tabs = await until(() => {
    const found = [...shadow().querySelectorAll<HTMLElement>("[role='tab']")];
    return found.length > 0 && found;
  });
  const dock = await until(() => shadow().querySelector<HTMLElement>("[role='region']"));
  const right = dock.getBoundingClientRect().right;
  expect(tabs.every((tab) => tab.getBoundingClientRect().right <= right + 0.5)).toBe(true);
});

it("disables the editor picker and pick while paused, and makes the content inert", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='Pause the devtool']"))
  ).click();
  await until(() => shadow().textContent?.includes("The devtool is paused"));
  expect(shadow().querySelector("[aria-label='Pick a node in the page']")).toBeNull();
  expect(
    shadow().querySelector<HTMLElement>("[aria-label='Editor']")?.hasAttribute("data-disabled")
  ).toBe(true);
  expect(shadow().querySelector("[inert]")).not.toBeNull();
});

it("puts the reopen button in the chosen corner, as an icon when chosen", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  const choose = async (text: string) => {
    (await until(() => shadow().querySelector<HTMLElement>("[aria-label='Settings']"))).click();
    const item = await until(() =>
      [...shadow().querySelectorAll<HTMLElement>("[role^='menuitem']")].find(
        (element) => element.textContent == text
      )
    );
    item.click();
    await until(() => !shadow().querySelector("[role='menu']"));
  };
  await choose("Top left");
  await choose("Show as icon");
  shadow().querySelector<HTMLElement>("[aria-label='Close']")?.click();
  const reopen = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Open Wordgard DevTools']")
  );
  expect(reopen.textContent).toBe("");
  expect(reopen.querySelector("svg")).not.toBeNull();
  const place = reopen.getBoundingClientRect();
  expect(place.top).toBeLessThan(40);
  expect(place.left).toBeLessThan(40);
  expect(JSON.parse(localStorage.getItem("wordgard-devtools:dock") ?? "{}")).toMatchObject({
    corner: "top-left",
    minimized: true,
  });
});

it("shows the reopen button's tooltip", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => shadow().querySelector<HTMLElement>("[aria-label='Close']"))).click();
  const reopen = await until(() =>
    shadow().querySelector<HTMLElement>("[aria-label='Open Wordgard DevTools']")
  );
  await userEvent.hover(reopen);
  await until(() =>
    [...shadow().querySelectorAll("[data-slot='tooltip-content']")].some(
      (t) => t.textContent == "Open Wordgard DevTools"
    )
  );
});

it("shows the shown tab's guide, with links to Wordgard's reference", async () => {
  open("first", "<p>Alpha</p>");
  mounted = mountDevtools();
  await mounted.ready;
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='About the Structure tab']"))
  ).click();
  const popup = await until(() =>
    shadow().querySelector<HTMLElement>("[data-slot='popover-content']")
  );
  expect(popup.textContent).toContain("tree of nested boxes");
  const link = popup.querySelector<HTMLAnchorElement>("a[href^='https://wordgard.net/docs/ref/']");
  expect(link?.target).toBe("_blank");
  await userEvent.keyboard("{Escape}");
  await until(() => !shadow().querySelector("[data-slot='popover-content'][data-open]"));
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")]
    .find((t) => t.textContent == "Log")
    ?.click();
  (
    await until(() => shadow().querySelector<HTMLElement>("[aria-label='About the Log tab']"))
  ).click();
  await until(() =>
    shadow()
      .querySelector("[data-slot='popover-content']")
      ?.textContent?.includes("Recorded transactions")
  );
});
