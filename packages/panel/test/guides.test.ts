import { afterEach, expect, it, vi } from "vitest";
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

const tab = (name: string) =>
  [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
    (element) => element.textContent == name
  );
const byLabel = (label: string) => shadow().querySelector<HTMLElement>(`[aria-label="${label}"]`);
const popup = () => shadow().querySelector<HTMLElement>("[data-slot='popover-content']");

const mount = async () => {
  mounted = mountDevtools();
  await mounted.ready;
  (await until(() => tab("Selection"))).click();
};

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
  await mount();
};

it("links Wordgard's reference inline, with no reference row", async () => {
  await setup();
  (await until(() => byLabel("About the Selection tab"))).click();
  const content = await until(() => popup());
  expect(content.textContent).not.toContain("Reference:");
  const link = content.querySelector<HTMLAnchorElement>("p a");
  expect(link?.href).toBe("https://wordgard.net/docs/ref/#state.GardSelection");
  expect(content.textContent).toContain(
    "The bar at the bottom of the panel always shows the selection"
  );
});

it("guides the selection bar", async () => {
  await setup();
  const bar = await until(() => byLabel("Selection"));
  const guide = await until(() =>
    bar.querySelector<HTMLElement>("[aria-label='About the selection bar']")
  );
  guide.click();
  await until(() => popup()?.textContent?.includes("at a glance, under every tab"));
  expect(shadow().textContent).not.toContain("Open the Selection tab");
});

it("shows or hides the guides from Settings, and remembers it", async () => {
  await setup();
  await until(
    () =>
      byLabel("About the Selection tab") &&
      byLabel("About Selection") &&
      byLabel("About the selection bar")
  );
  const toggle = async () => {
    (await until(() => byLabel("Settings"))).click();
    (
      await until(() =>
        [...shadow().querySelectorAll<HTMLElement>("[role='menuitemcheckbox']")].find(
          (item) => item.textContent == "Display guidances"
        )
      )
    ).click();
    await until(() => !shadow().querySelector("[role='menu']"));
  };
  await toggle();
  await until(
    () =>
      !byLabel("About the Selection tab") &&
      !byLabel("About Selection") &&
      !byLabel("About the selection bar")
  );
  expect(localStorage.getItem("wordgard-devtools:guides")).toBe("false");

  mounted?.unmount();
  await mount();
  await until(() => byLabel("Settings"));
  expect(byLabel("About the Selection tab")).toBeNull();
  await toggle();
  await until(() => byLabel("About the Selection tab"));
  expect(localStorage.getItem("wordgard-devtools:guides")).toBe("true");
});

it("links the repository from Settings", async () => {
  await setup();
  (await until(() => byLabel("Settings"))).click();
  const link = await until(() =>
    [...shadow().querySelectorAll<HTMLAnchorElement>("a[role='menuitem']")].find(
      (item) => item.textContent == "GitHub repository"
    )
  );
  expect(link.href).toBe("https://github.com/stesura/wordgard-dev-tools");
  expect(link.target).toBe("_blank");
});
