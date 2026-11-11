# Wordgard DevTools

A DevTools panel for Wordgard editors. Use it to inspect the  
document, the state, the rendered DOM, the schema and the state fields, and to record transactions  
with their timing.

[Try the demo](https://stesura.github.io/wordgard-dev-tools/): editors with the panel docked.

Inspired by [prosemirror-dev-tools](https://github.com/d4rkr00t/prosemirror-dev-tools), rebuilt
for Wordgard's model.

> Status: 0.x until Wordgard reaches 1.0, so minor versions may break things. Feedback is welcome:
> [open an issue](https://github.com/stesura/wordgard-dev-tools/issues). The extension isn't in the
> browser stores yet.

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [Usage](#usage)
  - [1. Register your editors](#1-register-your-editors)
  - [2. Mount the panel](#2-mount-the-panel)
  - [Keep it out of production](#keep-it-out-of-production)
- [Tabs](#tabs)
  - [Structure](#structure)
  - [Selection](#selection)
  - [State](#state)
  - [DOM](#dom)
  - [Schema](#schema)
  - [Fields](#fields)
  - [Extensions](#extensions)
  - [Log](#log)
- [Packages](#packages)
- [Contributing](#contributing)
- [License](#license)

## Quick start

```sh
npm install -D @stesura/wordgard-dev-tools @stesura/wordgard-dev-tools-panel
```

Add the plugin to your editor and dock the panel:

```ts
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";
import { mountDevtools } from "@stesura/wordgard-dev-tools-panel";

Wordgard.create({ parent, doc, config: [basicSchema(), wordgardDevtools()] });
mountDevtools();
```

Run your dev server: the panel is docked at the bottom of the page. Both calls do nothing in
production builds (see [Keep it out of production](#keep-it-out-of-production)).

For coding agents, the panel package ships a skill with these steps: copy
`node_modules/@stesura/wordgard-dev-tools-panel/skills/wordgard-devtools/` into your project's
`.claude/skills/` (Claude Code), or point your agent at its `SKILL.md`.

## Features

- **Editor picker**: every connected editor on the page, iframes included.
- **Element picker**: click a node in the page to find it in the panel. Picking doesn't move the caret.
- **Tabs**: Structure, Selection, State, DOM, Schema, Fields, Extensions and Log, described [below](#tabs).
- **Log the editor**: the button at the right of the tab bar logs the `Wordgard` instance to the
  console.
- **Guidance**: Guidance for how to use and links to the wordgard documentation can be found accross the devtools under a question mark icon. Disable guidance from the panel's settings.
- **Off when closed**: So it doesn't hinder performance, nothing runs until the panel opens.

## Usage

### 1. Register your editors

Editors register explicitly with the `wordgardDevtools()` plugin from `@stesura/wordgard-dev-tools`:

```ts
import { Wordgard } from "wordgard/editor";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";

Wordgard.create({
  parent,
  doc,
  config: [basicSchema(), wordCount, wordgardDevtools({ name: "main", fields: { wordCount } })],
});
```

| Option    | Type                                                       | Default                                        | Description                                                                                  |
| --------- | ---------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `name`    | `string`                                                   | the editor's `aria-label`, then `editor #n`    | Shown in the panel's editor picker.                                                          |
| `fields`  | `{[name: string]: GardState.Field}`                        | none: their debug names, or `field #n`         | Names the editor's state fields in the Fields tab, and adds them to the State tab's JSON.    |
| `names`   | `{[name: string]: facet, compartment, field or extension}` | none: their debug names, or numbered           | Names them in the Extensions tab, by identity (a field in the Fields tab too).               |
| `enabled` | `boolean`                                                  | `false` in production builds, `true` otherwise | Whether to register the editor. See [Keep it out of production](#keep-it-out-of-production). |

#### Naming what the panel shows

Fields, facets, compartments, effects, annotations and node groups show by the debug name they
were defined with; unnamed ones are numbered (`field #n`, `facet #n`, `annotation #n`). Name them
where you define them:

```ts
const wordCount = GardState.Field.define({ name: "wordCount", create: …, update: … });
const spellcheckOn = GardState.Facet.define<boolean, boolean>({ name: "spellcheckOn", … });
const language = GardState.Compartment.define("language");
const setLanguage = Transaction.Effect.define<string>({ name: "setLanguage" });
const fromServer = Transaction.Annotation.define<boolean>("fromServer");
const Asides = Node.Group.define({ name: "Asides" });
```

The `fields` and `names` options override debug names. Pass `fields` to see a field in the State
tab's JSON as well, by its name there.

`wordgard` (`~0.7.0`: 0.7.x) is a peer dependency. Wordgard's minor releases break its API,
and the devtools read some of its internals, so each minor needs a devtools release: until
then, npm refuses the install. Keep Wordgard on the minor the devtools support, or upgrade both.
If a Wordgard patch release breaks the devtools, they turn themselves off with one console
warning; your editor keeps working.

### 2. Mount the panel

```ts
import { mountDevtools } from "@stesura/wordgard-dev-tools-panel";

mountDevtools();
```

The panel docks at the bottom of the page.

Call it once, anywhere in your app's startup code (your entry file is a good place), before or
after creating your editors: the panel lists editors as they register and drop out. Where it goes
in the DOM doesn't matter either: the dock is fixed to the window, above everything, whatever
element holds it. The default, `document.body`, suits almost every page. Pass `parent` only to
keep it out of an element your app manages (one a framework re-renders, or an editor's), or out of
an ancestor with a `transform`, `filter` or `contain`, which would make it fixed to that element
instead of the window.

| Option      | Type        | Default                                        | Description                                                                              |
| ----------- | ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `parent`    | `Element`   | `document.body`                                | The element the panel goes in. Keep it outside your editors.                             |
| `enabled`   | `boolean`   | `false` in production builds, `true` otherwise | Whether to mount the panel. See [Keep it out of production](#keep-it-out-of-production). |
| `transport` | `Transport` | the in-page transport                          | How the panel talks to the page. Only for custom hosts.                                  |

It returns a handle:

| Field     | Type            | Description                                                        |
| --------- | --------------- | ------------------------------------------------------------------ |
| `unmount` | `() => void`    | Releases the handle; the panel goes when every handle is released. |
| `ready`   | `Promise<void>` | Resolves once the panel has rendered.                              |
| `host`    | `HTMLElement    | null`                                                              | The `<wordgard-devtools>` element; the panel renders in its shadow root. `null` on a server. |

A page has at most one panel. While one is mounted, `mountDevtools()` returns another handle to
it, and ignores a different `parent` or `transport` (with a warning). The panel is removed when
every handle has been unmounted, for example on a route change in a single-page app.

It is safe to call where there's no DOM: during server rendering (Next.js, Remix) it does nothing.
Called from a script in `<head>`, it mounts once the page's body exists.

The panel renders in a shadow root, so its styles and your page's styles don't affect each other.
Its React UI is bundled with it and loaded lazily on the first `mountDevtools()` call. Your page
doesn't need React.

With React, there is no component to render: the panel brings its own React, so call
`mountDevtools()` in your entry file. To show it only while a component is mounted, for example
on one route:

```tsx
const WordgardDevtools = () => {
  useEffect(() => mountDevtools().unmount, []);
  return null;
};
```

Return `unmount` from the effect, as above: React's Strict Mode runs the effect twice, and the
panel only goes once both handles are released.

### Keep it out of production

Both are off in production builds (when your bundler sets `process.env.NODE_ENV` to
`"production"`, as Vite, webpack and Next do):

- `wordgardDevtools()` adds nothing to the editor's config, so the editor isn't registered and
  no panel sees it.
- `mountDevtools()` mounts nothing and downloads nothing. The panel's chunks are still emitted but
  never loaded.

With Vite, webpack or Next.js there's nothing to do. Pass `enabled` to either one to decide
yourself:

```ts
// Keep it in production, e.g. on a staging build; or your own switch.
wordgardDevtools({ enabled: true });
mountDevtools({ enabled: settings.debug });

// Without a bundler (plain ES modules, import maps), or with one that doesn't set NODE_ENV
// (Rollup without @rollup/plugin-replace), every build counts as development: say when it's on.
const dev = location.hostname == "localhost";
wordgardDevtools({ enabled: dev });
mountDevtools({ enabled: dev });
```

Their small page-side code still ships. To drop it as well, gate the calls so your bundler removes
them:

```ts
// Vite's flag; with webpack or Next.js, process.env.NODE_ENV != "production".
if (import.meta.env.DEV) {
  const { mountDevtools } = await import("@stesura/wordgard-dev-tools-panel");
  mountDevtools();
}

const config = [basicSchema(), ...(import.meta.env.DEV ? [wordgardDevtools()] : [])];
```

<!-- tabs:start: written from packages/panel/src/guides/ by `npm run readme`; edit there -->

## Tabs

### Structure

![The Structure tab](docs/screenshots/structure.png)

The document as represented by a tree of nested boxes, each box being a [plots](https://wordgard.net/docs/ref/#doc.Plot) or a [leaf](https://wordgard.net/docs/ref/#doc.Leaf) node.

- Each node displays its [type](https://wordgard.net/docs/ref/#doc.Node.Type), [marks](https://wordgard.net/docs/ref/#doc.Mark) and from–to positions.
- Selection is show through a darker (lighter in dark mode) background.
- [A document is a tree of nodes](https://wordgard.net/docs/ref/#h-document): [plots](https://wordgard.net/docs/ref/#doc.Plot) (nodes with content nodes) or [leaves](https://wordgard.net/docs/ref/#doc.Leaf); [marks](https://wordgard.net/docs/ref/#doc.Mark) are pieces of information attached to nodes.

Tips:

- Click a box for its detail and JSON in the Node pane; Escape clears it. Close the pane with its ×; the Node button, or a double-click on a box, opens it again (a double-click also scrolls the editor to the node).
- Right-click a box for more actions.
- Use the pick button, then click in the page, to find a node.
- In the page's console, `$wg` is the editor the panel shows.
- Decorations shows the editor's [decorations](https://wordgard.net/docs/ref/#editor.Decoration): ◆ marks a widget, ◇ 2 a node with two decorations, and a dotted underline the part of a text a range decorates. Click a box for what each adds.
- Decorations opens a pane beside the node's: the selected node's decorations (else the document's), the count, which lists every decoration by source (pick one to go to its node), and arrows that step through the nodes that have any. Close it, or press Escape in it, to turn decorations off.
- By default a range decoration applies to the text in its range, not the paragraph around it; a point decoration to the node starting at it.

### Selection

![The Selection tab](docs/screenshots/selection.png)

The [selection](https://wordgard.net/docs/ref/#state.GardSelection), its [slice](https://wordgard.net/docs/ref/#doc.Slice), and its anchor and head [resolved](https://wordgard.net/docs/ref/#h-resolved-positions). Each card's guide explains its fields.

Tips:

- The bar at the bottom of the panel always shows the selection, whichever tab is open: its type, anchor, head and marks.
- Nodes link to the Structure, types to the Schema.
- Right click a card to log or copy it.

### State

![The State tab](docs/screenshots/state.png)

The [editor state](https://wordgard.net/docs/ref/#state.GardState) as collapsible JSON: [`GardState.toJSON()`](https://wordgard.net/docs/ref/#state.GardState.toJSON), with the named fields that serialise.

- The state tracks the current document, the selection, the configuration of the editor, and any extra state defined by extensions, in [fields](https://wordgard.net/docs/ref/#state.GardState.Field).

Tips:

- Right-click a line to highlight its node in the editor, show it in the Structure, log it (live or as JSON), or copy its JSON or path.
- The toolbar logs the whole state, live or as JSON.
- Download the state as a JSON file, or replace it from one: the file is checked against the schema first, and the replacement can be undone. Fields aren't restored.

### DOM

![The DOM tab](docs/screenshots/dom.png)

The editor's [content DOM](https://wordgard.net/docs/ref/#editor.Wordgard.contentDOM): the editable DOM element holding the editor content. Each element shows the document node it draws; text shows its position.

- Elements that draw no node and hold none of the document's text, such as widgets, are marked as chrome. Marks and wrapper decorations hold the document's text: they aren't.
- Whether the editor is connected, editable, focused or composing: the bottom bar's Editor.

Tips:

- Click an element to outline it in the page; Escape clears it.
- Right-click an element to show its node in the Structure, log it, or log or copy its outer HTML.

### Schema

![The Schema tab](docs/screenshots/schema.png)

The [schema](https://wordgard.net/docs/ref/#h-schema)'s node and mark types and node groups: what each holds, where it can go, its parameter and its spec.

- A schema is a collection of node and mark types, including exactly one document type, plus an optional set of [overrides](https://wordgard.net/docs/ref/#doc.Schema.Override) that modify the relations between those elements.

Tips:

- Filter by name or tag. Collapse a section from its title.
- Type names link between cards. Double-click a card to see its spec as JSON.
- Order marks by rank to see how they nest.
- Each section's guide explains its cards.
- `decorated`: the editor draws the type differently, through [tag decorations](https://wordgard.net/docs/ref/#editor.Decoration.Tag) (a shape, wrappers, widgets, attributes) or [`Decoration.Mark.shape`](https://wordgard.net/docs/ref/#editor.Decoration.Mark.shape); the Effective view lists them. Functions of the node are evaluated on the first node of the type in the document.

### Fields

![The Fields tab](docs/screenshots/fields.png)

Each [`GardState.Field`](https://wordgard.net/docs/ref/#state.GardState.Field): its value, and the changes seen to it, each linked to its transaction in the Log.

- Fields store additional information in an editor state, and keep it in sync with the rest of the state.
- Changes are tracked while this tab is shown, or while the Log records.

Tips:

- Fields show by their debug name: `GardState.Field.define({name: "wordCount", …})`. Unnamed ones show as "field #n".
- `wordgardDevtools({fields: {name: field}})` names a field too, overriding its debug name, and adds it to the State tab's JSON.
- Search filters the fields by name or by value, the whole value, not just its preview.
- Expand a change to see its value; right-click to log or copy it.
- For a [`PointSet` or `RangeSet`](https://wordgard.net/docs/ref/#set), click a position to show its node in the Structure.
- Amber "kept, not mapped": the set wasn't mapped through a change that moved it; usually a missing `set.map(tr.changes)`.
- Expand a set change to see what it added and dropped.

### Extensions

![The Extensions tab](docs/screenshots/extensions.png)

The editor's [configuration](https://wordgard.net/docs/ref/#state.GardState.Extension) as Wordgard resolves it: what it keeps, at which [precedence](https://wordgard.net/docs/ref/#state.GardState.prec), and in which order each [facet](https://wordgard.net/docs/ref/#state.GardState.Facet) gets its values.

- Extensions: the configuration, nested as the app wrote it.
- Details: the selected extension, its value in the current state, and its place among its facet's values.
- Key bindings: the editor's [key bindings](https://wordgard.net/docs/ref/#editor.KeyBinding), in the order Wordgard tries them.

Tips:

- Click a row to select it; double-click it, or click the + button, to open its details.
- Click the keyboard button to open the key bindings.
- Click "By facet" to list each facet with its values in the order Wordgard gives them.
- Name what shows as `facet #n` or `compartment #n` where you define it: `GardState.Facet.define({name: "spellcheckOn"})`, `GardState.Compartment.define("language")`. Or by identity with `wordgardDevtools({names: {name: value}})`, which overrides debug names, or with a plain `{name: "spellcheck", extension}` object.
- Right-click a row, the details or a key binding (or Shift+F10) to log it to the console, show it in Fields or copy it.

### Log

![The Log tab](docs/screenshots/log.png)

Recorded [transactions](https://wordgard.net/docs/ref/#state.Transaction). For each: what it changed, its selection, [effects](https://wordgard.net/docs/ref/#state.Transaction.Effect) and [annotations](https://wordgard.net/docs/ref/#state.Transaction.Annotation), and how long its [dispatch](https://wordgard.net/docs/ref/#editor.Wordgard.dispatch) and [flush](https://wordgard.net/docs/ref/#editor.Wordgard.flush) took.

- Typically, a user action creates a single transaction, which may contain any number of document changes, may change the selection, or have other effects.
- [userEvent](https://wordgard.net/docs/ref/#state.Transaction.userEvent): a string identifying the user interface event, dot-separated (`input.type`, `select.pointer`).
- Updates over 16 ms, a frame, are flagged.

Tips:

- Press Record, then use the editor.
- Filter by user event, what changed or annotation; sort by any column.
- Effects and annotations show by their debug name: `Transaction.Effect.define({name: "setLanguage"})`, `Transaction.Annotation.define("fromServer")`. Unnamed effects show as `effect`, unnamed annotations as `annotation #n`.
- Right-click a row to log the transaction or copy it as JSON or text; right-click a part of its detail to log or copy that part.
- Copy as repro copies a Node script that replays the transactions on plain Wordgard, from the state before the oldest, and checks the document it ends with: a bug report's schema, document and steps. Its header says what it leaves out.
- Untick record select.pointer to leave out selections made with the pointer, and record focus to leave out focus changes.
- In the page's console, `$tr` is the transaction shown here, `$wg` its editor.

<!-- tabs:end -->

## Packages

| Package                                               | What it is                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@stesura/wordgard-dev-tools`](packages/devtools)    | Page side, framework-free. The plugin, the editor registry and the agent that answers the panel.                                                                             |
| [`@stesura/wordgard-dev-tools-panel`](packages/panel) | The React panel and `mountDevtools()`. It uses a `Transport`, so it doesn't depend on where it runs. React is bundled, so pages need neither React nor a particular version. |
| [`packages/extension`](packages/extension)            | The WXT extension shell around the panel.                                                                                                                                    |
| [`demo`](demo)                                        | A Vite page with several editors and the in-page panel docked.                                                                                                               |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) to set up the repository, run the demo and the checks, and
contribute; [SECURITY.md](SECURITY.md) to report a vulnerability.

## License

[MIT](LICENSE). The panel package and the extension bundle third-party code; their builds include
its licences in `THIRD_PARTY_LICENSES.txt`. The components in
[packages/panel/src/components/ui](packages/panel/src/components/ui) are copied from shadcn/ui
([MIT](packages/panel/src/components/ui/LICENSE.md)). The tabs' guides adapt wording from
Wordgard's reference documentation (MIT, Marijn Haverbeke).
