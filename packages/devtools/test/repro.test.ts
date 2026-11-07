import { afterEach, expect, it } from "vitest";
import { commands } from "vitest/browser";
import { Leaf, Node, Plot } from "wordgard/doc";
import { Wordgard } from "wordgard/editor";
import { horizontalRule } from "wordgard/schema";
import { GardSelection, GardState, Transaction } from "wordgard/state";
import { CellSelection, tables } from "wordgard/table";
import { Strong } from "wordgard/types";
import { wordgardDevtools } from "../src/index.ts";
import { ask, editor, registry } from "./helpers.ts";

const editors: Wordgard[] = [];

const open = (config: GardState.Extension = [], content?: string) => {
  const wg = editor([wordgardDevtools({ name: "body" }), config], content);
  editors.push(wg);
  return wg;
};

afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
});

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0;

const recording = async (
  wg: Wordgard,
  options: { size?: number; selectPointer?: boolean } = {}
) => {
  await ask({ type: "select", id: idOf(wg) });
  await ask({ type: "record", id: idOf(wg), on: true, ...options });
};

const type = (wg: Wordgard, text: string, pos = 1) =>
  wg.dispatch({ changes: { from: pos, insert: [Leaf.text(text)] }, userEvent: "input.type" });

const repro = (wg: Wordgard) => ask({ type: "repro", id: idOf(wg) });

/** Runs the script in Node: it exits 0 only when the replayed document is the recorded one. */
const run = async (script: string) => {
  const result = await commands.runNode(script);
  if (result.code != 0) throw new Error(`The repro failed:\n${result.stderr}\n${script}`);
  return result.stdout;
};

it("replays typing, marks, deletions and selections in Node", async () => {
  const wg = open();
  type(wg, "x");
  await recording(wg);
  type(wg, "ab", 3);
  wg.dispatch({ changes: { from: 8, to: 12, add: Strong }, userEvent: "format" });
  wg.dispatch({ changes: { from: 2, to: 4 }, selection: { anchor: 2 }, userEvent: "delete" });
  wg.dispatch({ selection: { anchor: 3, head: 9 }, userEvent: "select" });
  const script = await repro(wg);
  // The state before the oldest recorded transaction: "x" typed before recording is in it.
  expect(script).toContain('"xTitle"');
  expect(script).toContain('// on "body", #0 to #3.');
  expect(script).toContain(
    'import { Doc, Strong, Emphasis, Link, Paragraph, Heading, LineBreak } from "wordgard/types";'
  );
  expect(script).toContain("// #1, format");
  expect(script).not.toContain("TODO");
  expect(await run(script)).toContain(
    "Replayed 4 steps: the document and selection match the recorded ones."
  );
});

it("replays node selections", async () => {
  const wg = open(horizontalRule(), "<p>a</p><hr><p>b</p>");
  await recording(wg);
  const rule = wg.state.doc.content[1];
  if (!rule) throw new Error("No rule");
  wg.dispatch({ selection: GardSelection.node(3, rule) });
  wg.dispatch({ changes: { from: 3, to: 4 }, userEvent: "delete" });
  const script = await repro(wg);
  expect(script).toContain('{"index":0,"selection":{"pos":3,"type":"node"}}');
  expect(script).toContain("HorizontalRule");
  await run(script);
});

it("fails when the replayed document differs", async () => {
  const wg = open();
  await recording(wg);
  type(wg, "a");
  const script = (await repro(wg)).replace(/^const expected = .*$/m, "const expected = {};");
  const result = await commands.runNode(script);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("The replayed document differs from the recorded one");
});

it("replays appended transactions and extenders' changes once, dropping effects", async () => {
  const effect = Transaction.Effect.define<number>();
  const wg = open([
    // Each typed "!" gets a "?" appended after it.
    Transaction.appender.of((trs, state) =>
      trs.some((tr) => tr.isUserEvent("input.type") && state.doc.textContent().includes("!"))
        ? { changes: { from: 1, insert: [Leaf.text("?")] }, effects: effect.of(1) }
        : null
    ),
    // Every typed transaction also inserts "+" at the start of the paragraph.
    Transaction.extender.of((tr) =>
      tr.isUserEvent("input.type") ? { changes: { from: 8, insert: [Leaf.text("+")] } } : null
    ),
  ]);
  await recording(wg);
  type(wg, "!");
  const { rows } = await ask({ type: "log", id: idOf(wg), from: 0, to: 10 });
  expect(rows.map((row) => row.appended)).toEqual([false, true]);
  const script = await repro(wg);
  expect(script).toContain("// #1, appended, 1 effect dropped");
  expect(script).toContain(
    "Effects are dropped: their types have no names to serialise (1 effect here)."
  );
  expect(wg.state.doc.textContent()).toContain("?!Title");
  await run(script);
});

it("starts from the oldest transaction the log still holds", async () => {
  const wg = open();
  await recording(wg, { size: 3 });
  for (const text of ["a", "b", "c", "d", "e"]) type(wg, text);
  const script = await repro(wg);
  expect(script).toContain("3 transactions recorded");
  expect(script).toContain("#2 to #4");
  // The snapshot has what the trimmed transactions typed.
  expect(script).toContain('"baTitle"');
  await run(script);
});

it("leaves out what comes before a gap in the log", async () => {
  const wg = open();
  await recording(wg);
  type(wg, "a");
  await ask({ type: "record", id: idOf(wg), on: false });
  type(wg, "b");
  await ask({ type: "record", id: idOf(wg), on: true });
  type(wg, "c");
  const script = await repro(wg);
  expect(script).toContain("1 transaction recorded");
  expect(script).toContain(
    "// - 1 older transaction left out: before #1, transactions it didn't record (paused, or left out), or the state replaced."
  );
  await run(script);
});

it("sets the selections the log left out", async () => {
  const wg = open();
  await recording(wg, { selectPointer: false });
  type(wg, "a");
  wg.dispatch({ selection: { anchor: 10 }, userEvent: "select.pointer" });
  wg.dispatch({ changes: { from: 10, insert: [Leaf.text("b")] }, userEvent: "input.type" });
  const script = await repro(wg);
  expect(script).toContain("// a selection the log didn't record");
  await run(script);
  // Without it, the replay ends with another selection.
  const without = script.replace(/^.*a selection the log didn't record\n/m, "");
  const result = await commands.runNode(without);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("The replayed selection differs from the recorded one");
});

it("replays cell selections", async () => {
  const table = "<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table><p>z</p>";
  const wg = open(tables(), table);
  await recording(wg);
  const { doc } = wg.state;
  const cells: number[] = [];
  for (let pos = 0; pos < doc.length; pos++)
    if (doc.resolve(pos).nodeAfter?.name == "Cell") cells.push(pos);
  const [a, , , d] = cells;
  if (a == null || d == null) throw new Error("No cells");
  const cell = CellSelection.between(doc, a, d + (doc.resolve(d).nodeAfter?.length ?? 0));
  if (!cell) throw new Error("No cell selection");
  wg.dispatch({ selection: cell });
  type(wg, "y", doc.length - 2);
  const script = await repro(wg);
  expect(script).toContain('import { CellSelection } from "wordgard/table";');
  expect(script).toContain('"type":"cell"');
  await run(script);
});

it("marks the schema's types that aren't Wordgard's as TODOs", async () => {
  const Callout = Plot.define("Callout", {
    blockContent: Node.Group.Content,
    group: Node.Group.Content,
    shape: { element: "aside", selector: "aside" },
  });
  const wg = open(GardState.schemaElement.of(Callout), "<aside><p>Hi</p></aside>");
  await recording(wg);
  type(wg, "a", 2);
  const script = await repro(wg);
  expect(script).toContain("/* TODO: Callout, your node type */");
  expect(script).toContain(
    "Fill in what isn't Wordgard's (the TODOs below): Callout, your node type."
  );
  // As generated, the schema lacks Callout.
  expect((await commands.runNode(script)).code).not.toBe(0);
});

it("refuses an empty log", async () => {
  const wg = open();
  await recording(wg);
  await expect(repro(wg)).rejects.toThrow("The log holds no transactions: record some first");
});
