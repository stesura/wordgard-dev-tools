import { afterEach, expect, it } from "vitest";
import { Decoration, Widget, Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { Paragraph, Strong } from "wordgard/types";
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

const badge = Widget.define<string>({ render: (value) => document.createTextNode(value) });

it("tags decorated types and sums up what their decorations do", async () => {
  wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Alpha</p>",
    config: [
      basicSchema(),
      // A function of the node: evaluated on the first paragraph.
      Decoration.Tag.widget(Paragraph, "start", (tag) => badge.of(tag.type.name)),
      Decoration.Tag.attribute(Paragraph, "data-p", "1"),
      Decoration.Mark.shape(Strong, { element: "b" }),
      wordgardDevtools({ name: "s" }),
    ],
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
        (element) => element.textContent == "Schema"
      )
    )
  ).click();
  const card = await until(() =>
    shadow().querySelector<HTMLElement>("[data-type='node-Paragraph']")
  );
  expect(card.textContent).toContain("decorated");
  expect(card.textContent).toContain('widget start: ⟨widget "Paragraph"⟩; attribute data-p="1"');
  expect(card.textContent).toContain("for the node at 0");
  const strong = await until(() =>
    shadow().querySelector<HTMLElement>("[data-type='mark-Strong']")
  );
  expect(strong.textContent).toContain("shape <b>");
});
