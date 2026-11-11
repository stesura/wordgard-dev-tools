import { afterEach, expect, it } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

let wg: Wordgard | null = null;
let mounted: MountedDevtools | null = null;

const emulate = (features: { name: string; value: string }[]) =>
  cdp().send("Emulation.setEmulatedMedia", { features });

afterEach(async () => {
  await emulate([]);
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

const line = (id: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='State'] [data-line='${id}']`);

/** The State tab, searching for "type". */
const searching = async () => {
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
  (
    await until(() =>
      [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find(
        (element) => element.textContent == "State"
      )
    )
  ).click();
  await until(() => line("$/doc/type"));
  await userEvent.click(
    await until(() => shadow().querySelector<HTMLInputElement>("[aria-label='Search the state']"))
  );
  await userEvent.keyboard("type");
  return await until(() => shadow().querySelector<HTMLElement>(".search-current"));
};

it("shows a selected search match as both, in forced colours", async () => {
  await emulate([{ name: "forced-colors", value: "active" }]);
  const current = await searching();
  const other = await until(() => shadow().querySelector<HTMLElement>(".search-match"));
  current.click();
  await until(() => current.getAttribute("aria-selected") == "true");
  expect(getComputedStyle(current).outlineStyle).toBe("double");
  expect(getComputedStyle(current).outlineWidth).toBe("4px");
  other.click();
  await until(() => other.getAttribute("aria-selected") == "true");
  expect(getComputedStyle(other).outlineStyle).toBe("dashed");
  // Not selected any more: the match's own outline.
  expect(getComputedStyle(current).outlineStyle).toBe("solid");
});

it("opens menus without zooming or sliding under reduced motion", async () => {
  const scale = async () => {
    const target = await until(() => line("$/doc/type"));
    target.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    );
    const menu = await until(() => shadow().querySelector<HTMLElement>("[role='menu']"));
    const style = getComputedStyle(menu);
    const values = [
      style.getPropertyValue("--tw-enter-scale").trim(),
      style.getPropertyValue("--tw-enter-translate-y").trim(),
    ];
    await userEvent.keyboard("{Escape}");
    await until(() => !shadow().querySelector("[role='menu']"));
    return values;
  };
  await searching();
  // Zooms in from 95%, by default.
  expect((await scale())[0]).not.toBe("1");
  await emulate([{ name: "prefers-reduced-motion", value: "reduce" }]);
  expect(await scale()).toEqual(["1", "0"]);
});
