import { afterEach, expect, it, vi } from "vitest";
import { Leaf } from "wordgard/doc";
import { Decoration, Widget, decoratePlots, type Wordgard } from "wordgard/editor";
import type { PointSet } from "wordgard/set";
import { GardSelection, GardState } from "wordgard/state";
import { Paragraph } from "wordgard/types";
import { wordgardDevtools, type FlushSource } from "../src/index.ts";
import { FLUSHES_PER_REQUEST } from "../src/log.ts";
import { ask, editor, registry } from "./helpers.ts";

// "<h1>Title</h1><p>Hello <strong>world</strong></p>": the heading 0–7, the paragraph 7–20.

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0;

const open = async (config: GardState.Extension, options: { selectPointer?: boolean } = {}) => {
  const wg = editor([wordgardDevtools(), config]);
  editors.push(wg);
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "record", id, on: true, ...options });
  return { wg, id };
};

const type = (wg: Wordgard, text: string, pos = 1) =>
  wg.dispatch({ changes: { from: pos, insert: [Leaf.text(text)] } });

const marker = Widget.define<string>({ render: (value) => document.createTextNode(value) });
const hoistedDeco = Decoration.Point.attributes({ class: "hoisted" });
const staleSet = Decoration.Point.set([[Decoration.Point.attributes({ class: "stale" }), 7]]);

// (a) A field, mapped.
const field = GardState.Field.define<PointSet<Decoration.Point>>({
  create: () => Decoration.Point.set([[Decoration.Point.attributes({ class: "field" }), 7]]),
  update: (set, tr) => set.map(tr.changes),
});
let failing = false;
const mapped = (state: GardState) => state.field(field);
// (b) New values on each call.
const rebuilt = (state: GardState) =>
  Decoration.Point.set([
    [Decoration.Point.attributes({ class: "rebuilt" }), state.doc.length - 13],
  ]);
// (c) The same values, rebuilt.
const hoisted = (state: GardState) => Decoration.Point.set([[hoistedDeco, state.doc.length - 13]]);
// (d) Follows the selection.
const cursor = (state: GardState) =>
  Decoration.Point.set([[Decoration.Point.widget(marker.of("|")), state.selection.head]]);
// (e) Throws, when the test asks only: the editor calls it too.
const throwing = () => {
  if (failing) throw new Error("boom");
  return Decoration.Point.none;
};
// (f) Never mapped.
const stale = () => staleSet;
const sources = [
  field,
  Decoration.Point.source.of(mapped),
  Decoration.Point.source.of(rebuilt),
  Decoration.Point.source.of(hoisted),
  Decoration.Point.source.of(cursor),
  Decoration.Point.source.of(throwing),
  Decoration.Point.source.of(stale),
  // (g) Refreshed on every selection change.
  decoratePlots({
    type: Paragraph,
    points: (_, point) => point(Decoration.Point.attributes({ class: "plot" }), 0),
    refresh: (tr) => (tr.selection ? () => true : false),
  }),
];

const detail = async (id: number, index: number) => {
  failing = true;
  const entry = await ask({ type: "entry", id, index }).finally(() => (failing = false));
  return entry.decorations;
};

const byName = (list: FlushSource[] | undefined, name: string | null) =>
  list?.filter((s) => s.name == name);
const one = (list: FlushSource[] | undefined, name: string | null) => byName(list, name)?.[0];

it("judges each source over a selection-only flush", async () => {
  const { wg, id } = await open(sources);
  wg.dispatch({ selection: { anchor: 3 } });
  wg.flush();
  const flush = await detail(id, 0);
  expect(flush).toMatchObject({ flush: 1, rows: [0], gapBefore: false, error: null });
  const list = flush?.sources;
  expect(one(list, "mapped")).toMatchObject({ match: "same", wasted: false, ms: null });
  expect(one(list, "mapped")?.set?.verdict).toBe("same");
  expect(one(list, "rebuilt")).toMatchObject({ wasted: true, set: { verdict: "recreated" } });
  expect(one(list, "rebuilt")?.ms).toEqual(expect.any(Number));
  expect(one(list, "hoisted")).toMatchObject({ wasted: true, set: { verdict: "updated" } });
  const cursor = one(list, "cursor");
  expect(cursor).toMatchObject({ wasted: false, set: { verdict: "recreated" } });
  expect(cursor?.set?.changed?.count).toBe(2);
  expect(cursor?.changed.map((c) => c.path)).toEqual([[0], [0, 0]]);
  expect(one(list, "throwing")).toMatchObject({ set: null, error: "boom", wasted: false });
  expect(one(list, "stale")).toMatchObject({ wasted: false, set: { verdict: "same" } });
  // decoratePlots' anonymous source, refreshed: rebuilt for nothing.
  expect(byName(list, null)?.[0]).toMatchObject({
    wasted: true,
    set: { verdict: "recreated", changed: { count: 0 } },
  });
  expect(one(list, "node selection")).toMatchObject({ builtIn: true, set: { verdict: "same" } });
});

it("judges each source over a document change", async () => {
  const { wg, id } = await open(sources);
  type(wg, "ab");
  wg.flush();
  const list = (await detail(id, 0))?.sources;
  // Mapped: the same values, moved. Not waste.
  expect(one(list, "mapped")).toMatchObject({ wasted: false, set: { verdict: "updated" } });
  expect(one(list, "mapped")?.set).toMatchObject({ kept: 1, added: 0, dropped: 0 });
  expect(one(list, "hoisted")).toMatchObject({ wasted: false, set: { verdict: "updated" } });
  // New values where mapping would have put the old ones.
  expect(one(list, "rebuilt")).toMatchObject({ wasted: true, set: { verdict: "recreated" } });
  expect(one(list, "stale")).toMatchObject({ wasted: false, set: { verdict: "moved" } });
  const summary = (
    await ask({ type: "log", id, from: 0, to: Number.MAX_SAFE_INTEGER, decorations: true })
  ).rows[0]?.decorationSummary;
  expect(summary).toEqual({ wasted: 1, updated: 3, recreated: 2, notMapped: 1 });
});

it("composes the changes of a flush's transactions into one verdict", async () => {
  const { wg, id } = await open(sources);
  type(wg, "a");
  type(wg, "b", 2);
  wg.flush();
  const [first, second] = [await detail(id, 0), await detail(id, 1)];
  expect(first).toEqual(second);
  expect(first?.rows).toEqual([0, 1]);
  expect(one(first?.sources, "mapped")).toMatchObject({ set: { verdict: "updated", kept: 1 } });
  expect(one(first?.sources, "stale")?.set?.verdict).toBe("moved");
  const { rows } = await ask({
    type: "log",
    id,
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    decorations: true,
  });
  expect(rows[0]?.decorationSummary).toEqual(rows[1]?.decorationSummary);
});

it("never counts the node selection's rebuilt point as waste", async () => {
  const { wg, id } = await open([]);
  const paragraph = wg.state.doc.nodeAt(7);
  if (!paragraph) throw new Error("No paragraph");
  wg.dispatch({ selection: GardSelection.node(7, paragraph) });
  wg.flush();
  wg.dispatch({});
  wg.flush();
  const selection = one((await detail(id, 1))?.sources, "node selection");
  expect(selection).toMatchObject({ builtIn: true, wasted: false, set: { verdict: "updated" } });
  expect(selection?.set?.changed?.count).toBe(0);
});

it("composes across a skipped select.pointer row, and says when one came before", async () => {
  const { wg, id } = await open(sources, { selectPointer: false });
  type(wg, "a");
  wg.dispatch({ selection: { anchor: 3 }, userEvent: "select.pointer" });
  type(wg, "b");
  wg.flush();
  const inside = await detail(id, 0);
  expect(inside).toMatchObject({ rows: [0, 1], error: null, gapBefore: false });
  wg.dispatch({ selection: { anchor: 2 }, userEvent: "select.pointer" });
  wg.flush();
  type(wg, "c");
  wg.flush();
  expect(await detail(id, 2)).toMatchObject({ rows: [2], gapBefore: true });
});

const late = () => Decoration.Point.set([[Decoration.Point.attributes({ class: "late" }), 7]]);

it("pairs sources across a reconfigure: added, and a new function in the same slot", async () => {
  const slot = GardState.Compartment.define();
  // A new function on each call, named alike, returning equal sets.
  const make = () => {
    const again = () =>
      Decoration.Point.set([[Decoration.Point.attributes({ class: "again" }), 7]]);
    return Decoration.Point.source.of(again);
  };
  const { wg, id } = await open(slot.of(make()));
  wg.dispatch({ effects: slot.reconfigure(make()) });
  wg.flush();
  // The editor pairs sets by function: it redraws both, whatever they hold.
  const again = one((await detail(id, 0))?.sources, "again");
  expect(again).toMatchObject({ match: "slot", wasted: false, set: { verdict: "recreated" } });
  expect(again?.set?.changed?.count).toBe(1);
  wg.dispatch({
    effects: GardState.appendConfig.of(Decoration.Point.source.of(late)),
  });
  wg.flush();
  const added = one((await detail(id, 1))?.sources, "late");
  expect(added).toMatchObject({
    match: "added",
    wasted: false,
    set: { verdict: "updated", added: 1 },
  });
});

it("works out a limited number of flushes per request, the rest pending", async () => {
  const { wg, id } = await open(sources);
  const flushes = FLUSHES_PER_REQUEST + 5;
  for (let i = 0; i < flushes; i++) {
    wg.dispatch({ selection: { anchor: 1 + (i % 5) } });
    wg.flush();
  }
  // Not drawn yet: no summary.
  wg.dispatch({ selection: { anchor: 2 } });
  const ask100 = () => {
    failing = true;
    return ask({
      type: "log",
      id,
      from: 0,
      to: Number.MAX_SAFE_INTEGER,
      decorations: true,
    }).finally(() => (failing = false));
  };
  const { rows } = await ask100();
  const pending = rows.filter((row) => row.decorationSummary == "pending");
  // The oldest wait.
  expect(pending.map((row) => row.index)).toEqual([0, 1, 2, 3, 4]);
  expect(rows.at(-1)?.decorationSummary).toBeNull();
  // A throwing source fails no row.
  expect(rows[10]?.decorationSummary).toMatchObject({ wasted: 3 });
  const again = await ask100();
  expect(again.rows.filter((row) => row.decorationSummary == "pending")).toEqual([]);
  // Without the flag, no summaries at all.
  const plain = await ask({ type: "log", id, from: 0, to: Number.MAX_SAFE_INTEGER });
  expect(plain.rows.some((row) => "decorationSummary" in row)).toBe(false);
});

it("has no verdicts for a row not drawn yet, and logs a flush's sets", async () => {
  const { wg, id } = await open(sources);
  type(wg, "a");
  expect(await detail(id, 0)).toBeNull();
  await expect(ask({ type: "logEntry", id, index: 0, part: "decorations" })).rejects.toThrow(
    "isn't drawn yet"
  );
  wg.flush();
  const logged = vi.spyOn(console, "log").mockImplementation(() => {});
  await ask({ type: "logEntry", id, index: 0, part: "decorations" });
  const [label, value] = logged.mock.calls[0] ?? [];
  expect(label).toBe("[wordgard-devtools] flush #1, decoration sources before and after");
  expect(value).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        source: "Decoration.Point.source #6 (stale)",
        before: staleSet,
        after: staleSet,
      }),
    ])
  );
});

it("spares an incremental rebuild of what a change touched", async () => {
  const { wg, id } = await open(sources);
  // Inside the paragraph: decoratePlots recreates its point at the paragraph's start.
  type(wg, "x", 10);
  wg.flush();
  const plots = byName((await detail(id, 0))?.sources, null)?.[0];
  expect(plots).toMatchObject({ wasted: false, set: { verdict: "recreated" } });
  expect(plots?.set?.changed?.count).toBe(0);
  // A source rebuilding everything is still wasted outside the paragraph: none here.
  expect(one((await detail(id, 0))?.sources, "rebuilt")?.wasted).toBe(false);
});

it("has no verdicts when a transaction in the flush wasn't recorded", async () => {
  const { wg, id } = await open(sources);
  type(wg, "a");
  await ask({ type: "record", id, on: false });
  type(wg, "b");
  await ask({ type: "record", id, on: true });
  type(wg, "c");
  wg.flush();
  expect(await detail(id, 0)).toMatchObject({
    rows: [0, 1],
    sources: [],
    error: expect.stringContaining("wasn't recorded"),
  });
});

it("says which rows leave the editor's current document", async () => {
  const { wg, id } = await open([]);
  const slice = () => ask({ type: "log", id, from: 0, to: Number.MAX_SAFE_INTEGER });
  type(wg, "a");
  wg.dispatch({ selection: { anchor: 1 } });
  expect((await slice()).currentFrom).toBe(0);
  type(wg, "b");
  wg.dispatch({ selection: { anchor: 1 } });
  expect((await slice()).currentFrom).toBe(2);
  // Changed while not recording: no row leaves today's document.
  await ask({ type: "record", id, on: false });
  type(wg, "c");
  expect((await slice()).currentFrom).toBeNull();
});

it("drops cached verdicts with their rows, and works them out again from the rows left", async () => {
  const { wg, id } = await open(sources);
  // Two rows in the first flush; a ring of two drops one of them on the next row.
  await ask({ type: "record", id, on: true, size: 2 });
  type(wg, "a");
  type(wg, "b", 2);
  wg.flush();
  expect((await detail(id, 0))?.rows).toEqual([0, 1]);
  type(wg, "c", 3);
  wg.flush();
  expect((await detail(id, 1))?.rows).toEqual([1]);
  await ask({ type: "clear", id });
  type(wg, "d");
  wg.flush();
  const { rows } = await ask({
    type: "log",
    id,
    from: 0,
    to: Number.MAX_SAFE_INTEGER,
    decorations: true,
  });
  expect(rows.map((row) => [row.index, row.flush])).toEqual([[3, 3]]);
  expect((await detail(id, 3))?.rows).toEqual([3]);
});
