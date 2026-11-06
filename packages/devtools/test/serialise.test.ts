import { expect, it, vi } from "vitest";
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { GardState } from "wordgard/state";
import { wordgardDevtools, type NodePart } from "../src/index.ts";
import { preview, toSafe } from "../src/serialise.ts";
import { ask, registry } from "./helpers.ts";

it("copies values safely", () => {
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic.self = cyclic;
  expect(toSafe(cyclic)).toEqual({ a: 1, self: "[Circular]" });
  expect(toSafe({ deep: { deeper: {} } }, 1)).toEqual({ deep: "[Object]" });
  expect(toSafe(new Map([["k", 1]]))).toEqual({ "[Map]": [["k", 1]] });
  expect(toSafe(new Set([1, 2]))).toEqual({ "[Set]": [1, 2] });
  expect(toSafe(new RangeError("bad"))).toEqual({ name: "RangeError", message: "bad" });
  expect(toSafe(new Uint8Array(3))).toBe("[Uint8Array(3 bytes)]");
  expect(toSafe(document.body)).toBe("[BODY]");
  expect(toSafe(() => 1)).toBe("[Function anonymous]");
  expect(toSafe(10n)).toBe("10n");
  expect(toSafe({ toJSON: () => ({ json: true }) })).toEqual({ json: true });
  // Shared, not cyclic: kept twice.
  const shared = { x: 1 };
  expect(toSafe([shared, shared])).toEqual([{ x: 1 }, { x: 1 }]);
});

it("previews values as truncated JSON", () => {
  expect(preview(null)).toBeNull();
  expect(preview("hi")).toBe('"hi"');
  expect(preview({ src: "a".repeat(100) })).toHaveLength(80);
});

it("walks an object whose toJSON needs arguments", () => {
  const value = {
    depth: 2,
    toJSON: (state: { facet: () => number }) => state.facet(),
  };
  expect(toSafe(value)).toEqual({ depth: 2, toJSON: "[Function toJSON]" });
});

it("serialises the state, with the named fields that can", async () => {
  const count = GardState.Field.define<number>({
    create: () => 3,
    update: (v) => v,
    toJSON: (v) => ({ count: v }),
  });
  const plain = GardState.Field.define<number>({ create: () => 4, update: (v) => v });
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), count, plain, wordgardDevtools({ fields: { count, plain } })],
  });
  const json = await ask({ type: "stateJSON", id: registry().editors.get(wg)?.id ?? 0 });
  expect(json).toEqual({
    doc: {
      type: "Doc",
      content: [{ type: "Paragraph", content: [{ type: "Text", param: "Hi" }] }],
    },
    selection: expect.objectContaining({ type: "text", anchor: 1 }),
    count: { count: 3 },
  });
  wg.dom.remove();
});

it("logs the state's values: live where it can, the JSON otherwise", async () => {
  const count = GardState.Field.define<number>({
    create: () => 3,
    update: (v) => v,
    toJSON: (v) => ({ count: v }),
  });
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>Hi</p>",
    config: [basicSchema(), count, wordgardDevtools({ fields: { count } })],
  });
  const id = registry().editors.get(wg)?.id ?? 0;
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const logged = async (keys: string[], json?: boolean) => {
    await ask({ type: "logState", id, keys, json });
    return log.mock.calls.at(-1);
  };
  expect(await logged([])).toEqual(["[wordgard-devtools] state", wg.state]);
  expect(await logged(["selection"])).toEqual([
    "[wordgard-devtools] state.selection",
    wg.state.selection,
  ]);
  expect(await logged(["count"])).toEqual(["[wordgard-devtools] state.field(count)", 3]);
  expect(await logged(["doc", "content", "0", "type"])).toEqual([
    "[wordgard-devtools] state.toJSON().doc.content[0].type",
    "Paragraph",
  ]);
  expect(await logged(["selection", "anchor"])).toEqual([
    "[wordgard-devtools] state.toJSON().selection.anchor",
    1,
  ]);
  // As JSON, even where there's a live value.
  expect(await logged(["count"], true)).toEqual([
    "[wordgard-devtools] state.toJSON().count",
    { count: 3 },
  ]);
  await ask({ type: "logNode", id, path: [0], json: true });
  expect(log.mock.calls.at(-1)).toEqual([
    "[wordgard-devtools] Paragraph at range 0–4",
    wg.state.doc.content[0]?.toJSON(),
  ]);
  // One of its values, live.
  const part = async (path: number[], part: NodePart) => {
    await ask({ type: "logNode", id, path, part });
    return log.mock.calls.at(-1);
  };
  const text = wg.state.doc.content[0];
  expect(await part([0], "type")).toEqual([
    "[wordgard-devtools] Paragraph at range 0–4, type",
    text?.type,
  ]);
  expect(await part([0], "range")).toEqual([
    "[wordgard-devtools] Paragraph at range 0–4, from–to",
    { from: 0, to: 4 },
  ]);
  expect(await part([0, 0], "text")).toEqual(["[wordgard-devtools] Text at range 1–3, text", "Hi"]);
  await expect(ask({ type: "logNode", id, path: [0, 0], part: { mark: 0 } })).rejects.toThrow(
    "No mark 0"
  );
  log.mockRestore();
  wg.dom.remove();
});

it("resolves positions", async () => {
  // Paragraph 0–6: "a" 1–2, "bc" (Strong) 2–4, "d" 4–5.
  const wg = Wordgard.create({
    parent: document.body,
    doc: "<p>a<strong>bc</strong>d</p>",
    config: [basicSchema(), wordgardDevtools()],
  });
  const id = registry().editors.get(wg)?.id ?? 0;
  const top = await ask({ type: "resolve", id, pos: 0 });
  expect(top).toMatchObject({
    depth: 0,
    parent: { name: "Doc", path: [] },
    index: 0,
    inText: 0,
    nodeBefore: null,
    nodeAfter: { name: "Paragraph", path: [0] },
    textblock: null,
    atStart: true,
  });
  const start = await ask({ type: "resolve", id, pos: 1 });
  expect(start).toMatchObject({
    depth: 1,
    parent: { name: "Paragraph", path: [0], from: 0, to: 6 },
    index: 0,
    inText: 0,
    nodeBefore: null,
    nodeAfter: { path: [0, 0] },
    textblock: { path: [0] },
    atStart: true,
    atEnd: false,
  });
  const inBold = await ask({ type: "resolve", id, pos: 3 });
  expect(inBold).toMatchObject({
    index: 1,
    inText: 1,
    nodeBefore: { path: [0, 1] },
    nodeAfter: { path: [0, 1] },
    textBefore: "b",
    textAfter: "c",
    marks: [{ name: "Strong" }],
  });
  expect(await ask({ type: "resolve", id, pos: 5 })).toMatchObject({
    atEnd: true,
    nodeBefore: { path: [0, 2] },
    nodeAfter: null,
  });
  await expect(ask({ type: "resolve", id, pos: 99 })).rejects.toThrow("outside the document");
  await expect(ask({ type: "resolve", id, pos: 1.5 })).rejects.toThrow("whole numbers");
  wg.dispatch({ selection: { anchor: 4, head: 2 } });
  const detail = await ask({ type: "selectionDetail", id });
  // Wordgard takes a range's marks from the nodes either side: "a" and "d", unmarked.
  expect(detail).toMatchObject({
    anchor: { pos: 4 },
    head: { pos: 2 },
    ranges: [{ from: 2, to: 4 }],
    activeMarks: [],
  });
  wg.dispatch({ selection: { anchor: 3 } });
  expect(await ask({ type: "selectionDetail", id })).toMatchObject({
    activeMarks: [{ name: "Strong" }],
  });
  // Across the paragraph's end: it closes in the slice.
  wg.dispatch({ selection: { anchor: 2, head: 6 } });
  expect((await ask({ type: "selectionDetail", id })).slice).toMatchObject({
    length: 4,
    text: "bcd",
    tokens: [
      { kind: "node", name: "Text", text: "bc", marks: ["Strong"] },
      { kind: "node", name: "Text", text: "d", marks: [] },
      { kind: "close" },
    ],
    more: 0,
    context: ["Paragraph"],
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  await ask({ type: "logPos", id, pos: 3 });
  expect(log.mock.calls.at(-1)?.[0]).toBe("[wordgard-devtools] doc.resolve(3)");
  await expect(ask({ type: "logPos", id, pos: 99 })).rejects.toThrow("outside the document");
  log.mockRestore();
  wg.dom.remove();
});

it("keeps the text next to the position, in a long text node", async () => {
  const text = "x".repeat(150) + "AB" + "y".repeat(150);
  const wg = Wordgard.create({
    parent: document.body,
    doc: `<p>${text}</p>`,
    config: [basicSchema(), wordgardDevtools()],
  });
  const id = registry().editors.get(wg)?.id ?? 0;
  // Between "A" and "B": offset 151 into the text, after the paragraph's opening.
  const { textBefore, textAfter } = await ask({ type: "resolve", id, pos: 152 });
  expect(textBefore).toMatch(/^…x+A$/);
  expect(textAfter).toMatch(/^By+…$/);
  wg.dom.remove();
});
