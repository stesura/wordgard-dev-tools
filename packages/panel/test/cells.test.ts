import { afterEach, expect, it } from "vitest";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { CellSelection, tables } from "wordgard/table";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools, type MountedDevtools } from "../src/index.ts";

const doc = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><p>after</p>";

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
    (element) => element.textContent == name
  );
const bar = () => shadow().querySelector<HTMLElement>("[aria-label='Selection']");
const box = (path: string) =>
  shadow().querySelector<HTMLElement>(`[aria-label='Document structure'] [data-path='${path}']`);
const selectionCard = () =>
  shadow().querySelector<HTMLElement>(
    "[data-slot='tabs-content']:not([hidden]) [data-section='Selection']"
  );

/** A 2×2 table, its right column selected from d (anchor) back up to b (head). */
const setup = async () => {
  const editor = Wordgard.create({
    parent: document.body,
    doc,
    config: [basicSchema(), tables(), wordgardDevtools()],
  });
  wg = editor;
  localStorage.setItem(
    "wordgard-devtools:dock",
    JSON.stringify({ side: "bottom", size: 640, collapsed: false })
  );
  mounted = mountDevtools();
  await mounted.ready;
  const state = editor.state;
  const cells: number[] = [];
  for (let pos = 0; pos < state.doc.length; pos++)
    if (state.doc.resolve(pos).nodeAfter?.name == "Cell") cells.push(pos);
  const [a, b, d] = [cells[0], cells[1], cells[3]];
  if (a == null || b == null || d == null) throw new Error("No cells");
  const dEnd = d + (state.doc.resolve(d).nodeAfter?.length ?? 0);
  // From cell d back to cell b: the right column.
  const sel = CellSelection.between(state.doc, dEnd, b);
  if (!sel) throw new Error("No cell selection");
  editor.dispatch({ selection: sel });
  return { b, d };
};

it("shows a cell selection's anchor and head cells in the bar", async () => {
  const { b, d } = await setup();
  const shown = await until(() => bar()?.textContent?.includes("anchorCell") && bar());
  expect(shown.textContent).toContain("type: cell");
  expect(shown.textContent).toContain(`anchorCell: ${d}`);
  expect(shown.textContent).toContain(`headCell: ${b}`);
  expect(shown.querySelector("[aria-label='Show the head cell in the Structure']")).not.toBeNull();
});

it("lists the cells in the Selection tab", async () => {
  const { b, d } = await setup();
  (await until(() => tab("Selection"))).click();
  const card = await until(
    () => selectionCard()?.textContent?.includes("anchorCell") && selectionCard()
  );
  expect(card.textContent).toContain(`anchorCell${d}[0, 1, 1]`);
  expect(card.textContent).toContain(`headCell${b}[0, 0, 1]`);
  expect(card.textContent).toContain("cells[0, 0, 1][0, 1, 1]");
});

it("marks the selected cells in the Structure, with the anchor and head cells", async () => {
  const { b, d } = await setup();
  (await until(() => tab("Structure"))).click();
  const head = await until(() => box("0.0.1")?.querySelector("[data-selection-end='start']"));
  expect(head.getAttribute("aria-label")).toBe(`Head cell - pos ${b}`);
  expect(
    box("0.1.1")?.querySelector("[data-selection-end='end']")?.getAttribute("aria-label")
  ).toBe(`Anchor cell - pos ${d}`);
  expect(box("0.0.1")?.dataset.selection).toBe("innermost");
  expect(box("0.1.1")?.dataset.selection).toBe("innermost");
  expect(box("0.0")?.dataset.selection).toBe("holds");
  expect(box("0.0.0")?.dataset.selection).toBeUndefined();
});
