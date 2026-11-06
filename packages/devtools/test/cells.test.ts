import { expect, it } from "vitest";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { CellSelection, tables } from "wordgard/table";
import { wordgardDevtools } from "../src/index.ts";
import { ask, registry } from "./helpers.ts";

const table =
  "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><p>after</p>";

it("sends a cell selection's anchor, head and cells", async () => {
  const wg = Wordgard.create({
    parent: document.body,
    doc: table,
    config: [basicSchema(), tables(), wordgardDevtools()],
  });
  const id = registry().editors.get(wg)?.id ?? 0;
  const { doc } = wg.state;
  // Positions directly in front of each cell, in document order.
  const cells: number[] = [];
  for (let pos = 0; pos < doc.length; pos++)
    if (doc.resolve(pos).nodeAfter?.name == "Cell") cells.push(pos);
  const [a, b, c, d] = cells;
  if (a == null || b == null || c == null || d == null) throw new Error("No cells");
  const cellEnd = d + (doc.resolve(d).nodeAfter?.length ?? 0);

  // From d back to a: the head is before the anchor.
  const sel = CellSelection.between(doc, cellEnd, a);
  if (!sel) throw new Error("No cell selection");
  wg.dispatch({ selection: sel });
  const info = await ask({ type: "selection", id });
  expect(info.cells).toEqual({
    anchorCell: d,
    anchorCellPath: [0, 1, 1],
    headCell: a,
    headCellPath: [0, 0, 0],
    paths: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
      [0, 1, 1],
    ],
  });
  expect(info.json).toMatchObject({ type: "cell" });

  wg.dispatch({ selection: { anchor: doc.length - 2 } });
  expect((await ask({ type: "selection", id })).cells).toBeNull();
  wg.dom.remove();
});

it("finds block cells, each holding a paragraph", async () => {
  const wg = Wordgard.create({
    parent: document.body,
    doc: table,
    config: [basicSchema(), tables({ cellContent: "block" }), wordgardDevtools()],
  });
  const id = registry().editors.get(wg)?.id ?? 0;
  const { doc } = wg.state;
  const cells: number[] = [];
  for (let pos = 0; pos < doc.length; pos++)
    if (doc.resolve(pos).nodeAfter?.name == "Cell") cells.push(pos);
  const [a, b] = cells;
  if (a == null || b == null) throw new Error("No cells");
  const sel = CellSelection.between(doc, a, b + (doc.resolve(b).nodeAfter?.length ?? 0));
  if (!sel) throw new Error("No cell selection");
  wg.dispatch({ selection: sel });
  expect((await ask({ type: "selection", id })).cells).toMatchObject({
    anchorCellPath: [0, 0, 0],
    headCellPath: [0, 0, 1],
    paths: [
      [0, 0, 0],
      [0, 0, 1],
    ],
  });
  wg.dom.remove();
});
