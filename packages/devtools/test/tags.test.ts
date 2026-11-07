import { afterEach, expect, it, vi } from "vitest";
import { Elt } from "wordgard/doc";
import { Decoration, Widget, Wordgard } from "wordgard/editor";
import { basicSchema, blockDoc, blockquote, paragraph } from "wordgard/schema";
import type { GardState } from "wordgard/state";
import { Blockquote, Heading, Paragraph, Strong } from "wordgard/types";
import { wordgardDevtools } from "../src/index.ts";
import { ask, registry } from "./helpers.ts";

const editors: Wordgard[] = [];
afterEach(async () => {
  await ask({ type: "select", id: null });
  for (const wg of editors.splice(0)) wg.dom.remove();
  vi.restoreAllMocks();
});

const open = (config: GardState.Extension, doc = "<h1>Title</h1><p>Hello</p>") => {
  const wg = Wordgard.create({ parent: document.body, doc, config: [config, wordgardDevtools()] });
  editors.push(wg);
  return registry().editors.get(wg)?.id ?? 0;
};

const badge = Widget.define<string>({ render: (value) => document.createTextNode(value) });

it("lists each type's tag decorations, evaluated on a real node of the type", async () => {
  const seen: unknown[] = [];
  const id = open([
    basicSchema(),
    blockquote(),
    // A constant shape without content on a plot: an atom now.
    Decoration.Tag.shape(Blockquote, Elt.mk("hr")),
    Decoration.Tag.shape(Heading, (tag) => {
      seen.push(tag);
      return Elt.mk(`h${tag.param}`, ["(", 0, ")"]);
    }),
    Decoration.Tag.wrapper(Paragraph, Elt.mk("div", [0, badge.of("w")]), { target: "p" }),
    Decoration.Tag.widget(Paragraph, "before", badge.of("b")),
    Decoration.Tag.widget(Paragraph, "end", (tag) => badge.of(tag.type.name)),
    Decoration.Tag.attribute(Paragraph, "data-p", () => "x"),
    Decoration.Mark.shape(Strong, { element: "b" }),
  ]);
  const { nodes, marks } = await ask({ type: "schema", id });
  const of = (name: string) => nodes.find((n) => n.name == name);
  // Called with the heading's own tag, never without one.
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.every((tag) => tag != undefined)).toBe(true);
  expect(of("Heading")?.decorations).toMatchObject({ shape: "<h1>(…)</h1>", at: 0 });
  const paragraphs = of("Paragraph");
  expect(paragraphs?.flags).toContain("decorated");
  expect(paragraphs?.decorations).toMatchObject({
    wrappers: ["<div>…⟨widget⟩</div> around p"],
    widgets: ['before: ⟨widget "b"⟩', 'end: ⟨widget "Paragraph"⟩'],
    attributes: ['data-p="x"'],
    at: 7,
  });
  expect(paragraphs?.effective.notes["decoration widgets"]).toBe("decoration");
  // No blockquote in the document: the constant shape needs none, the atom-ness is an override.
  const quote = of("Blockquote");
  expect(quote).toMatchObject({ atom: true });
  // A constant: Wordgard wraps it in a function of no tag, read without a node.
  expect(quote?.decorations).toMatchObject({ shape: "<hr></hr>", at: null });
  expect(quote?.effective.notes.atom).toBe("override");
  expect(quote?.effective.notes["decoration shape"]).toBe("override");
  expect(of("Text")?.decorations).toBeNull();
  const strong = marks.find((m) => m.name == "Strong");
  expect(strong).toMatchObject({ decoration: "<b>" });
  expect(strong?.flags).toContain("decorated");
  expect(strong?.effective.notes["decoration shape"]).toBe("override");
});

let failing = false;

it("reports a function that throws, and works on a schema without marks", async () => {
  const id = open(
    [
      blockDoc(),
      paragraph(),
      // Throws when the test asks only: the editor calls it too.
      Decoration.Tag.attribute(Paragraph, "data-x", () => {
        if (failing) throw new Error("boom");
        return "1";
      }),
    ],
    "<p>Hi</p>"
  );
  // Nothing left for the editor to draw: between here and the request's reply, only our call
  // evaluates the function (the request runs in one task once its modules are loaded).
  await ask({ type: "schema", id });
  editors.at(-1)?.flush();
  failing = true;
  const { nodes, marks } = await ask({ type: "schema", id }).finally(() => (failing = false));
  expect(marks).toEqual([]);
  expect(nodes.find((n) => n.name == "Paragraph")?.decorations).toMatchObject({
    attributes: ["data-x=function (it threw)"],
    errors: ["boom"],
  });
});

it("names the tag facets in the Extensions tab", async () => {
  const id = open([basicSchema(), Decoration.Tag.attribute(Paragraph, "data-p", "1")]);
  const { root } = await ask({ type: "extensions", id });
  const labels = JSON.stringify(root);
  expect(labels).toContain('"label":"Decoration.Tag.attribute"');
});
