import { afterEach, it } from "vitest";
import { Leaf } from "wordgard/doc";
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
  const root = mounted?.host?.shadowRoot;
  if (!root) throw new Error("No shadow root");
  return root;
};
const button = (text: string) =>
  [...shadow().querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent?.trim() == text
  );

it("makes $wg the editor shown and $tr the transaction opened in the Log", async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc: "<p>Alpha</p>",
    config: [basicSchema(), wordgardDevtools({ name: "c" })],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  await until(() => Reflect.get(window, "$wg") == editor);
  (
    await until(() =>
      [...shadow().querySelectorAll<HTMLElement>("[role='tab']")].find((element) =>
        element.textContent?.startsWith("Log")
      )
    )
  ).click();
  (await until(() => button("Record"))).click();
  await until(() => button("Pause"));
  editor.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  (
    await until(() =>
      shadow().querySelector<HTMLElement>("[aria-label='Transactions'] [role='option']")
    )
  ).click();
  await until(() => {
    const tr: unknown = Reflect.get(window, "$tr");
    return typeof tr == "object" && tr != null && "docChanged" in tr && tr.docChanged === true;
  });
});
