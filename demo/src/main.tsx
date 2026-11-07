import "./style.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { Plot } from "wordgard/doc";
import { Decoration, Widget, Wordgard } from "wordgard/editor";
import { history } from "wordgard/history";
import { basicSchema, image, imageResizing } from "wordgard/schema";
import { GardState, Transaction } from "wordgard/state";
import { tables } from "wordgard/table";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools } from "@stesura/wordgard-dev-tools-panel";
import { ReactEditor } from "./ReactEditor.tsx";

const plain = (id: string, doc: string, extra: GardState.Extension) => {
  const parent = document.getElementById(id);
  if (!parent) throw new Error(`No #${id}`);
  return Wordgard.create({ parent, doc, config: [basicSchema(), history(), extra] });
};

// A state field, named for the Fields tab.
const words = (doc: Plot.Doc) =>
  doc.textContent({ blockSeparator: " " }).split(/\s+/).filter(Boolean).length;
const wordCount = GardState.Field.define<number>({
  create: (state) => words(state.doc),
  update: (count, tr) => (tr.docChanged ? words(tr.newDoc) : count),
});

// The toolbar's highlight: a range decoration (a <mark> around the text, the document untouched)
// on each "DevTools", kept in a field an effect switches, worked out again as the text changes.
const WORD = "DevTools";
const setHighlight = Transaction.Effect.define<boolean>();
const highlightRange = Decoration.Range.wrapper("mark", { attributes: { class: "highlight" } });
const occurrences = (doc: Plot.Doc) =>
  Decoration.Range.set((add) =>
    doc.iterate(0, doc.length, (node, pos) => {
      if (!node.isText || typeof node.param != "string") return;
      for (const { index } of node.param.matchAll(new RegExp(WORD, "g")))
        add(highlightRange, pos + index, pos + index + WORD.length);
    })
  );
const highlight = GardState.Field.define<{ on: boolean; ranges: Decoration.Range.Set }>({
  create: () => ({ on: false, ranges: Decoration.Range.none }),
  update: (value, tr) => {
    const on = tr.effects.reduce((was, e) => (e.is(setHighlight) ? e.value : was), value.on);
    if (!on) return value.on ? { on, ranges: Decoration.Range.none } : value;
    return on != value.on || tr.docChanged ? { on, ranges: occurrences(tr.newDoc) } : value;
  },
});

const PHOTO =
  "https://plus.unsplash.com/premium_photo-1661954483883-edd65eac3577?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=NHwxMjA3fDA%3D";

const plainEditor = plain(
  "plain",
  "<h2>Plain Wordgard</h2>" +
    "<p><strong>Wordgard DevTools</strong> is a developer panel for <em>Wordgard</em> editors, " +
    "in the page (below) or in the browser's DevTools. It shows the document, the selection, " +
    "the schema, the <em>state</em> and its fields, and <strong>every transaction</strong> with " +
    'its timing; a recorded log copies as a repro. See the <a href="https://github.com/stesura/wordgard-devtools#readme">README</a>.</p>' +
    "<p>This editor is made with <em>Wordgard.create</em> and named <strong>plain</strong>: " +
    "pick it in the panel, press <em>Record</em> in the Log, then type here.</p>" +
    "<table><tr><th>Tab</th><th>Shows</th></tr>" +
    "<tr><td>State</td><td>The document tree</td></tr>" +
    "<tr><td>Log</td><td>Transactions</td></tr></table>" +
    // An inline image (Wordgard's `image()`): a leaf with its src as parameter, its alt a mark;
    // `imageResizing()` adds the corner handle and the ImageSize mark it sets.
    `<p><img src="${PHOTO.replaceAll("&", "&amp;")}" alt="A Japanese garden in the rain: a red arched bridge over a pond, maples and azaleas"></p>`,
  [
    tables(),
    image(),
    imageResizing(),
    wordCount,
    highlight,
    Decoration.Range.source.of((state) => state.field(highlight).ranges),
    wordgardDevtools({ name: "plain", fields: { wordCount, highlight }, enabled: true }),
  ]
);
const highlightButton = document.getElementById("highlight");
highlightButton?.addEventListener("click", () => {
  const on = !plainEditor.state.field(highlight).on;
  plainEditor.dispatch({ effects: setHighlight.of(on) });
  highlightButton.setAttribute("aria-pressed", String(on));
});
// A decoration source that builds a new widget on every call, where mapping the old one would
// do: the Log's Decorations check flags its flushes as wasted work.
const Length = Widget.define<number>({
  render: (length) => {
    const badge = document.createElement("span");
    badge.className = "length";
    badge.textContent = ` ${length}`;
    return badge;
  },
});
const lengthBadge = (state: GardState) => {
  const first = state.doc.content[0];
  if (!first) return Decoration.Point.none;
  const length = state.doc.textContent({ blockSeparator: " " }).length;
  return Decoration.Point.set([[Decoration.Point.widget(Length.of(length)), first.length - 1]]);
};

// Two plugins on one editor: still one entry, named by the one with a name.
plain("left", "<p>Left editor.</p>", [
  wordgardDevtools({ enabled: true }),
  wordgardDevtools({ name: "left", enabled: true }),
  Decoration.Point.source.of(lengthBadge),
]);
plain("right", "<p>Right editor.</p>", wordgardDevtools({ name: "right", enabled: true }));

const root = document.getElementById("react");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ReactEditor />
    </StrictMode>
  );
}

// The demo is deployed as a production build.
mountDevtools({ enabled: true });
