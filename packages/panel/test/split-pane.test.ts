import { afterEach, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
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

it("resizes the side pane, which never collapses, and keeps its size", async () => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), wordgardDevtools()],
  });
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 500, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  const handle = await until(() =>
    shadow().querySelector<HTMLElement>("[data-slot='resizable-handle']")
  );
  const pane = await until(() => shadow().querySelector<HTMLElement>("[aria-label='Node']"));
  const vertical = handle.getAttribute("aria-orientation") == "horizontal";
  const size = () =>
    vertical ? pane.getBoundingClientRect().height : pane.getBoundingClientRect().width;
  handle.focus();
  // To the end: the content as large as it goes, the pane at its minimum, not collapsed.
  await userEvent.keyboard("{End}");
  await until(() => size() > 0 && size() <= (vertical ? 81 : 201));
  expect(size()).toBeGreaterThanOrEqual(vertical ? 79 : 199);
  await until(() => localStorage.getItem("wordgard-devtools:pane"));
});

it("keeps a wide tab's content mounted when tabs switch", async () => {
  await page.viewport(1200, 800);
  try {
    wg = Wordgard.create({
      parent: document.body,
      doc: "<p>Hi</p>",
      config: [basicSchema(), wordgardDevtools()],
    });
    mounted = mountDevtools();
    await mounted.ready;
    const tab = (name: string) =>
      [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
        (e) => e.textContent == name
      );
    const structure = await until(() =>
      shadow().querySelector<HTMLElement>("[aria-label='Document structure']")
    );
    // Side by side: the handle is a vertical line.
    expect(
      shadow().querySelector("[data-slot='resizable-handle']")?.getAttribute("aria-orientation")
    ).toBe("vertical");
    tab("State")?.click();
    await until(() => shadow().querySelector("[aria-label='State'] [data-line]"));
    tab("Structure")?.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(shadow().querySelector("[aria-label='Document structure']")).toBe(structure);
  } finally {
    await page.viewport(414, 896);
  }
});
