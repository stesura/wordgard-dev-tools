import { afterEach, expect, it, vi } from "vitest";
import { Leaf } from "wordgard/doc";
import type { Wordgard } from "wordgard/editor";
import { history } from "wordgard/history";
import { RangeSet } from "wordgard/set";
import { Strong } from "wordgard/types";
import { GardState, Transaction } from "wordgard/state";
import { wordgardDevtools } from "../src/index.ts";
import { ask, editor, post, registry } from "./helpers.ts";

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const idOf = (wg: Wordgard) => registry().editors.get(wg)?.id ?? 0;

const bump = Transaction.Effect.define<number>();
const counter = GardState.Field.define<number>({
  create: () => 0,
  update: (value, tr) => tr.effects.reduce((v, e) => (e.is(bump) ? v + e.value : v), value),
});
const hidden = GardState.Field.define<string>({
  create: () => "in a compartment",
  update: (v) => v,
});
const compartment = GardState.Compartment.define();

const open = () => {
  const wg = editor([
    wordgardDevtools({ fields: { counter } }),
    history(),
    counter,
    GardState.prec.high(compartment.of(hidden)),
  ]);
  editors.push(wg);
  return wg;
};

it("lists the state's fields, named or numbered, with their values", async () => {
  const wg = open();
  const { fields, tracking } = await ask({ type: "fields", id: idOf(wg) });
  expect(tracking).toBe(false);
  const counterInfo = fields.find((f) => f.name == "counter");
  expect(counterInfo).toMatchObject({ named: true, preview: "0", changes: 0, last: null });
  // history()'s own field, and the one in a compartment.
  expect(fields.filter((f) => !f.named).map((f) => f.name)).toEqual(
    fields.filter((f) => !f.named).map((f) => `field #${f.index + 1}`)
  );
  expect(fields.some((f) => f.preview == '"in a compartment"')).toBe(true);
  expect(fields.length).toBeGreaterThanOrEqual(3);
});

it("tracks changes while watched, linked to the log when recording", async () => {
  const wg = open();
  const id = idOf(wg);
  await expect(ask({ type: "watchFields", id, on: true })).rejects.toThrow("Select the editor");
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  wg.dispatch({ effects: bump.of(2) });
  wg.flush();
  let info = (await ask({ type: "fields", id })).fields.find((f) => f.name == "counter");
  expect(info).toMatchObject({ preview: "2", changes: 1, last: { log: null, preview: "2" } });

  await ask({ type: "record", id, on: true });
  wg.dispatch({ effects: bump.of(3) });
  wg.flush();
  const detail = await ask({ type: "field", id, index: info?.index ?? 0 });
  expect(detail.value).toBe(5);
  expect(detail.history.map((c) => [c.log, c.preview])).toEqual([
    [null, "2"],
    [0, "5"],
  ]);
  // A document change touches history()'s field, not the counter.
  wg.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  wg.flush();
  info = (await ask({ type: "fields", id })).fields.find((f) => f.name == "counter");
  expect(info?.changes).toBe(2);
  expect((await ask({ type: "fields", id })).fields.some((f) => !f.named && f.changes > 0)).toBe(
    true
  );
});

it("stops tracking when no panel shows the editor", async () => {
  const wg = open();
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  await ask({ type: "select", id: null });
  expect((await ask({ type: "fields", id })).tracking).toBe(false);
});

it("keeps tracking for one panel when another stops watching", async () => {
  const wg = open();
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  // The extension's client shows the same editor, then hides its Fields tab.
  await post({ type: "select", id });
  await post({ type: "watchFields", id, on: true });
  await post({ type: "watchFields", id, on: false });
  expect((await ask({ type: "fields", id })).tracking).toBe(true);
  await post({ type: "select", id: null });
  expect((await ask({ type: "fields", id })).tracking).toBe(true);
});

it("sends and logs the value a change in the history set", async () => {
  const wg = open();
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  wg.dispatch({ effects: bump.of(2) });
  wg.dispatch({ effects: bump.of(3) });
  wg.flush();
  const index =
    (await ask({ type: "fields", id })).fields.find((f) => f.name == "counter")?.index ?? 0;
  const [first, second] = (await ask({ type: "field", id, index })).history;
  expect(first && second && second.seq > first.seq).toBe(true);
  expect(await ask({ type: "fieldChange", id, index, seq: first?.seq ?? 0 })).toEqual({
    value: 2,
    set: null,
  });
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  await ask({ type: "logField", id, index, seq: second?.seq ?? 0 });
  expect(logged).toEqual([["[wordgard-devtools] counter, as set by a transaction", 5]]);
  logged.length = 0;
  await ask({ type: "logField", id, index, history: true });
  expect(logged).toEqual([
    [
      "[wordgard-devtools] counter, history (newest first)",
      [
        expect.objectContaining({ transaction: null, value: 5 }),
        expect.objectContaining({ transaction: null, value: 2 }),
      ],
    ],
  ]);
  await ask({ type: "clearFieldHistory", id, index });
  await expect(ask({ type: "fieldChange", id, index, seq: first?.seq ?? 0 })).rejects.toThrow(
    "no longer in the history"
  );
});

it("clears every field's history without an index", async () => {
  const wg = open();
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  wg.dispatch({ effects: bump.of(2) });
  wg.dispatch({ changes: { from: 1, insert: [Leaf.text("x")] } });
  wg.flush();
  expect(
    (await ask({ type: "fields", id })).fields.filter((f) => f.changes > 0).length
  ).toBeGreaterThanOrEqual(2);
  await ask({ type: "clearFieldHistory", id });
  expect((await ask({ type: "fields", id })).fields.every((f) => f.changes == 0)).toBe(true);
});

it("finds fields by name or by value, past the preview's cut, ignoring case", async () => {
  const wg = open();
  const id = idOf(wg);
  const { fields } = await ask({ type: "fields", id });
  const indexOf = (name: string) => fields.find((f) => f.name == name)?.index;
  const hiddenIndex = fields.find((f) => f.preview == '"in a compartment"')?.index;
  expect(await ask({ type: "findFields", id, query: "COUNTER" })).toEqual([indexOf("counter")]);
  expect(await ask({ type: "findFields", id, query: "compartment" })).toEqual([hiddenIndex]);
  expect(await ask({ type: "findFields", id, query: "nothing like it" })).toEqual([]);
  expect(await ask({ type: "findFields", id, query: " " })).toEqual(fields.map((f) => f.index));
});

// A comment: equal by its text.
type Comment = RangeSet.Value & { text: string };
const comment = (text: string): Comment => ({
  text,
  inclusiveStart: false,
  inclusiveEnd: false,
  eq: (other) => "text" in other && other.text == text,
});
const initial = () => RangeSet.create([[comment("hi"), 3, 5]]);
const mapped = GardState.Field.define<RangeSet<Comment>>({
  create: initial,
  update: (set, tr) => set.map(tr.changes),
});
const forgotten = GardState.Field.define<RangeSet<Comment>>({
  create: initial,
  update: (set) => set,
});

it("compares a field's sets from one change to the next", async () => {
  const wg = editor([wordgardDevtools({ fields: { mapped, forgotten } }), mapped, forgotten]);
  editors.push(wg);
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  // Before the comment: the mapped field moves it, the other keeps it where it was.
  wg.dispatch({ changes: { from: 1, insert: [Leaf.text("XY")] } });
  // After it: nothing moves.
  wg.dispatch({ changes: { from: 10, insert: [Leaf.text("Z")] } });
  // A mark moves no position.
  wg.dispatch({ changes: { from: 1, to: 3, add: Strong } });
  wg.flush();
  const { fields } = await ask({ type: "fields", id });
  const indexOf = (name: string) => fields.find((f) => f.name == name)?.index ?? -1;
  const historyOf = async (name: string) =>
    (await ask({ type: "field", id, index: indexOf(name) })).history;

  const [moved, after] = await historyOf("mapped");
  expect(moved?.set).toMatchObject({ kind: "range", verdict: "updated", kept: 1 });
  expect(after?.set).toMatchObject({ verdict: "updated", kept: 1 });
  expect(fields.find((f) => f.name == "mapped")?.preview).toBe("RangeSet(1)");

  // The unmapped one is recorded only where its comment should have moved.
  const forgottenHistory = await historyOf("forgotten");
  expect(forgottenHistory).toHaveLength(1);
  expect(forgottenHistory[0]?.set).toMatchObject({ verdict: "moved" });
  expect(fields.find((f) => f.name == "forgotten")?.last?.set?.verdict).toBe("moved");
  const value = (await ask({ type: "field", id, index: indexOf("mapped") })).value;
  expect(value).toEqual({
    "[RangeSet]": [
      [5, 7, { text: "hi", inclusiveStart: false, inclusiveEnd: false, eq: "[Function eq]" }],
    ],
  });
  const detail = await ask({
    type: "fieldChange",
    id,
    index: indexOf("mapped"),
    seq: moved?.seq ?? 0,
  });
  expect(detail.set).toMatchObject({ verdict: "updated", addedEntries: [], droppedEntries: [] });
});

it("lists what a set change added and dropped, with the nodes they fall in", async () => {
  const add = Transaction.Effect.define<string>();
  const notes = GardState.Field.define<RangeSet<Comment>>({
    create: () => RangeSet.empty,
    update: (set, tr) => {
      const next = set.map(tr.changes);
      const texts = tr.effects.filter((e) => e.is(add)).map((e) => (e.is(add) ? e.value : ""));
      // Recreated on each "redo" effect: new objects, same places.
      return texts.length
        ? RangeSet.create(texts.map((text): [Comment, number, number] => [comment(text), 2, 4]))
        : next;
    },
  });
  const wg = editor([wordgardDevtools({ fields: { notes } }), notes]);
  editors.push(wg);
  const id = idOf(wg);
  await ask({ type: "select", id });
  await ask({ type: "watchFields", id, on: true });
  wg.dispatch({ effects: add.of("a") });
  wg.dispatch({ effects: add.of("a") });
  wg.flush();
  const index =
    (await ask({ type: "fields", id })).fields.find((f) => f.name == "notes")?.index ?? -1;
  const [first, second] = (await ask({ type: "field", id, index })).history;
  expect(first?.set).toMatchObject({ verdict: "updated", added: 1, dropped: 0 });
  // Recreated equal: nothing for the editor to redraw.
  expect(second?.set).toMatchObject({ verdict: "recreated", changed: { count: 0 } });
  const detail = await ask({ type: "fieldChange", id, index, seq: second?.seq ?? 0 });
  expect(detail.set?.addedEntries).toEqual([
    { from: 2, to: 4, side: null, value: expect.stringContaining('"text":"a"'), path: [0, 0] },
  ]);
  expect(detail.set?.droppedEntries).toEqual([
    expect.objectContaining({ from: 2, to: 4, path: null }),
  ]);
  // Once the document moves on, the added entries aren't linked either.
  wg.dispatch({ changes: { from: 1, insert: [Leaf.text("Q")] } });
  const later = await ask({ type: "fieldChange", id, index, seq: second?.seq ?? 0 });
  expect(later.set?.addedEntries[0]?.path).toBeNull();
});
