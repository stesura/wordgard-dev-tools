import { afterEach, expect, it, vi } from "vitest";
import { Attributes, Elt } from "wordgard/doc";
import { Decoration, Widget, decoratePlots, type Wordgard } from "wordgard/editor";
import { GardSelection, type GardState } from "wordgard/state";
import { Paragraph } from "wordgard/types";
import { wordgardDevtools } from "../src/index.ts";
import { ask, editor, registry } from "./helpers.ts";

// "<h1>Title</h1><p>Hello <strong>world</strong></p>": the heading 0–7 ("Title" 1–6), the
// paragraph 7–20 ("Hello " 8–14, "world" 14–19).

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const open = (config: GardState.Extension) => {
  const wg = editor([wordgardDevtools(), config]);
  editors.push(wg);
  return { wg, id: registry().editors.get(wg)?.id ?? 0 };
};

const marker = Widget.define<string>({ render: (value) => document.createTextNode(value) });

const highlights = () =>
  Decoration.Point.set([
    [Decoration.Point.wrapper(Elt.create("section", Attributes.none, [0, marker.of("in")])), 0],
    [Decoration.Point.shape(Elt.mk("h2", [0])), 0],
    [Decoration.Point.widget(marker.of("w"), { side: -1 }), 3],
    [Decoration.Point.attributes({ class: "para" }), 7],
    // Before a text leaf: Wordgard puts it on no node.
    [Decoration.Point.attributes({ class: "text" }), 8],
    [Decoration.Point.attributes({ class: "end" }), 20],
  ]);
const second = () =>
  Decoration.Point.set([
    [Decoration.Point.shape(Elt.mk("h3", [0])), 0],
    [Decoration.Point.shape(Elt.mk("h4", [0])), 0],
  ]);
const ranges = () =>
  Decoration.Range.set([
    [Decoration.Range.wrapper("mark", { query: Paragraph, scope: "all" }), 0, 20],
    // The default scope: atoms, so the text leaves, not the paragraph.
    [Decoration.Range.attribute("data-r", "1"), 7, 20],
  ]);

let failing = false;

const config = [
  Decoration.Point.source.of(highlights),
  Decoration.Point.source.of(second),
  Decoration.Range.source.of(ranges),
  // Throws when asked by the test only: the editor calls it too.
  Decoration.Range.source.of(() => {
    if (failing) throw new Error("boom");
    return Decoration.Range.none;
  }),
  decoratePlots({
    type: Paragraph,
    points: (_, point) => point(Decoration.Point.attributes({ class: "plot" }), 0),
  }),
];

it("lists each source's decorations, where Wordgard applies them", async () => {
  const { wg, id } = open(config);
  // The page's modules load on the first request: after that, a request runs in one task, and
  // only our call meets the throwing source.
  await ask({ type: "decorations", id });
  wg.flush();
  failing = true;
  const info = await ask({ type: "decorations", id }).finally(() => (failing = false));
  const named = info.sources.map(({ kind, name, builtIn, count, error }) => ({
    kind,
    name,
    builtIn,
    count,
    error,
  }));
  expect(named).toEqual([
    { kind: "point", name: "highlights", builtIn: false, count: 6, error: null },
    { kind: "point", name: "second", builtIn: false, count: 2, error: null },
    // decoratePlots: an anonymous source over its field.
    { kind: "point", name: null, builtIn: false, count: 1, error: null },
    { kind: "point", name: "node selection", builtIn: true, count: 0, error: null },
    { kind: "range", name: "ranges", builtIn: false, count: 2, error: null },
    { kind: "range", name: null, builtIn: false, count: 0, error: "boom" },
  ]);
  const of = (source: number) => info.decorations.filter((d) => d.source == source);
  const [wrapper, shape, widget, para, text, end] = of(0);
  expect(wrapper).toMatchObject({
    kind: "wrapper",
    paths: [[0]],
    details: [["wrapper", "<section>…⟨widget⟩</section>"]],
  });
  const across =
    "other sources put a shape here too: Wordgard draws one of them, not by source order";
  expect(shape).toMatchObject({ kind: "shape", paths: [[0]], note: across });
  expect(widget).toMatchObject({
    kind: "widget",
    from: 3,
    side: "before (-1)",
    at: [0, 0],
    offset: 2,
    paths: [],
    details: [
      ["param", '"w"'],
      ["track", "around"],
    ],
  });
  expect(para).toMatchObject({ kind: "attributes", paths: [[1]], side: "after" });
  expect(para?.details).toEqual([["attributes", 'class="para"']]);
  expect(text).toMatchObject({ paths: [], at: [1], note: expect.stringContaining("no node") });
  expect(end).toMatchObject({ paths: [], at: [], note: expect.stringContaining("no node") });
  expect(of(1)[0]).toMatchObject({
    kind: "shape",
    paths: [[0]],
    note: across,
  });
  expect(of(1)[1]).toMatchObject({ note: "an earlier shape in this source wins" });
  expect(of(2)[0]).toMatchObject({ kind: "attributes", from: 8 });
  const [mark, attribute] = of(4);
  expect(mark).toMatchObject({ kind: "range wrapper", paths: [[1]] });
  expect(mark?.details).toEqual(
    expect.arrayContaining([
      ["element", "<mark>…</mark>"],
      ["query", "Paragraph"],
      ["scope", "all"],
    ])
  );
  expect(attribute).toMatchObject({
    kind: "range attribute",
    paths: [
      [1, 0],
      [1, 1],
    ],
    details: expect.arrayContaining([
      ["attribute", 'data-r="1"'],
      ["scope", "atom"],
    ]),
  });
});

it("shows the node selection's own decoration", async () => {
  const { wg, id } = open([]);
  const paragraph = wg.state.doc.nodeAt(7);
  if (!paragraph) throw new Error("No paragraph");
  wg.dispatch({ selection: GardSelection.node(7, paragraph) });
  const info = await ask({ type: "decorations", id });
  const builtIn = info.sources.find((s) => s.builtIn);
  expect(builtIn).toMatchObject({ name: "node selection", count: 1 });
  expect(info.decorations).toEqual([
    expect.objectContaining({
      source: builtIn?.index,
      kind: "attributes",
      paths: [[1]],
      details: [["attributes", 'class="wg-selected-node"']],
    }),
  ]);
});

it("caps the decorations sent, counting each source's", async () => {
  const many = () =>
    Decoration.Point.set(
      Array.from({ length: 2100 }, (): [Decoration.Point, number] => [
        Decoration.Point.widget(marker.of("x")),
        1,
      ])
    );
  const { id } = open(Decoration.Point.source.of(many));
  const info = await ask({ type: "decorations", id });
  expect(info.sources[0]).toMatchObject({ count: 2100, exact: true });
  expect(info.decorations).toHaveLength(2000);
});

it("logs a source, or one of its decorations, live", async () => {
  const { id } = open(config);
  const logged: unknown[][] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
  await ask({ type: "logDecoration", id, source: 0 });
  expect(logged.at(-1)).toEqual([
    "[wordgard-devtools] Decoration.Point.source #1 (highlights)",
    highlights,
  ]);
  await ask({ type: "logDecoration", id, source: 0, index: 2 });
  expect(logged.at(-1)?.[0]).toBe(
    "[wordgard-devtools] Decoration.Point.source #1 (highlights), decoration at 3"
  );
  expect(logged.at(-1)?.[1]).toHaveProperty("widget");
  await expect(ask({ type: "logDecoration", id, source: 0, index: 99 })).rejects.toThrow(
    "no longer there"
  );
  await expect(ask({ type: "logDecoration", id, source: 99 })).rejects.toThrow(
    "No decoration source"
  );
});
