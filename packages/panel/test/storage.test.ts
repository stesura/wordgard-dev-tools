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
  vi.restoreAllMocks();
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

const byLabel = (label: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label=${JSON.stringify(label)}]`);

it("works with storage blocked: what it would save lasts until reload", async () => {
  const blocked = () => {
    throw new DOMException("Blocked", "SecurityError");
  };
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => errors.push(event.error);
  window.addEventListener("error", onError);
  try {
    wg = Wordgard.create({
      parent: document.body,
      doc: "<p>Hi</p>",
      config: [basicSchema(), wordgardDevtools()],
    });
    mounted = mountDevtools();
    await mounted.ready;
    await until(() => shadow().textContent?.includes("1 editor"));

    // A setting: the guides go, though it can't be saved.
    await until(() => byLabel("About the Structure tab"));
    (await until(() => byLabel("Settings"))).click();
    (
      await until(() =>
        [...shadow().querySelectorAll<HTMLElement>("[role='menuitemcheckbox']")].find(
          (item) => item.textContent == "Display guidances"
        )
      )
    ).click();
    await until(() => !byLabel("About the Structure tab"));

    // The dock's layout: closed and opened again.
    (await until(() => byLabel("Close"))).click();
    (await until(() => byLabel("Open Wordgard DevTools"))).click();
    await until(() => shadow().querySelector("[role='region']"));

    expect(read).toHaveBeenCalled();
    expect(write).toHaveBeenCalled();
    expect(errors).toEqual([]);
  } finally {
    window.removeEventListener("error", onError);
  }
});
