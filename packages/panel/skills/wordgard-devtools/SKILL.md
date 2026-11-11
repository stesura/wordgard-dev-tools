---
name: wordgard-devtools
description: Add Wordgard DevTools to an app with Wordgard editors - registering editors with the wordgardDevtools() plugin, docking the in-page panel with mountDevtools(), naming editors, fields and extensions for the panel, and keeping both out of production builds. Use when installing or configuring @stesura/wordgard-dev-tools or @stesura/wordgard-dev-tools-panel, or when debugging a Wordgard editor with them.
---

# Adding Wordgard DevTools to an app

Wordgard DevTools inspect [Wordgard](https://wordgard.net/docs/) editors: document, selection,
state, rendered DOM, schema, state fields, extensions and a log of transactions. Two packages,
always installed together at the same version:

- `@stesura/wordgard-dev-tools`: the `wordgardDevtools()` plugin. An editor shows in the panel
  only if its config has it.
- `@stesura/wordgard-dev-tools-panel`: `mountDevtools()`, the panel docked at the bottom of the
  page. Not needed with the browser extension (a "Wordgard" tab in DevTools).

Signatures: `node_modules/@stesura/wordgard-dev-tools/dist/plugin.d.ts` and
`node_modules/@stesura/wordgard-dev-tools-panel/dist/mount.d.ts`. Read them rather than guessing.

## Setup

```sh
npm install -D @stesura/wordgard-dev-tools @stesura/wordgard-dev-tools-panel
```

- Peer: `wordgard` `~0.7.0` (0.7.x), **one copy** in the app. A newer Wordgard minor needs a
  devtools release that supports it: until then npm refuses the install (an `ERESOLVE` peer
  conflict). Don't force it with `--legacy-peer-deps`. If a Wordgard patch release breaks the
  devtools, they turn themselves off with one console warning; the editor keeps working.
- Dev dependencies: both calls do nothing in production builds (below).

## 1. Register each editor

Add the plugin to the editor's config, once per editor:

```ts
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";

Wordgard.create({
  parent,
  doc,
  config: [basicSchema(), wordCount, wordgardDevtools({ name: "main", fields: { wordCount } })],
});
```

With react-wordgard, put it in the `config` passed to `<WordgardEditor>`. StrictMode is fine:
editors register when they connect, so the one StrictMode drops never shows.

Options, all optional:

- `name`: the editor's name in the panel's picker. Default: its `aria-label`, then `editor #n`.
- `fields`: `{name: GardState.Field}`. Names the app's fields in the Fields tab and adds them, by
  that name, to the State tab's JSON. Pass the same field objects the config uses.
- `names`: `{name: facet | compartment | field | extension}`. Names them in the Extensions tab,
  by identity. A config entry can also be named in place: `{ name: "spellcheck", extension }`.
- Both override debug names (below), so they're rarely needed for naming alone.
- `enabled`: see production, below.

## Naming what the panel shows

Give fields, facets, compartments, effects, annotations and node groups a debug name where you
define them; the panel shows it. Unnamed ones show numbered (`field #n`, `facet #n`).

```ts
const wordCount = GardState.Field.define({ name: "wordCount", create: …, update: … });
const spellcheckOn = GardState.Facet.define<boolean, boolean>({ name: "spellcheckOn", … });
const language = GardState.Compartment.define("language");
const setLanguage = Transaction.Effect.define<string>({ name: "setLanguage" });
const fromServer = Transaction.Annotation.define<boolean>("fromServer");
const Asides = Node.Group.define({ name: "Asides" });
```

The plugin's `fields` and `names` options override these, and only `fields` adds a field to the
State tab's JSON.

## 2. Dock the panel

```ts
import { mountDevtools } from "@stesura/wordgard-dev-tools-panel";

mountDevtools();
```

- Call it once, in the entry file. It returns `{ unmount, ready, host }`. A page has at most one
  panel: repeat calls return handles to the mounted one, and it goes when every handle is
  unmounted.
- `parent` (default `document.body`) must be outside every editor.
- On a server (no DOM) it does nothing, and `host` is `null`: no guard is needed around the call.
- The panel brings its own React, lazily loaded, in a shadow root: the page needs no React, and
  the page's CSS doesn't reach it. There is no React component to render. To show it only while a
  component is mounted (one route):

  ```tsx
  const WordgardDevtools = () => {
    useEffect(() => mountDevtools().unmount, []);
    return null;
  };
  ```

  Always return `unmount` from the effect.

- Skip this step if the developer uses the browser extension.

## Production

Both default to off when `process.env.NODE_ENV === "production"` (Vite, webpack, Next set it):
the plugin adds nothing, the panel mounts and downloads nothing.

- No bundler, or one that doesn't set `NODE_ENV` (plain ES modules, import maps, Rollup without
  `@rollup/plugin-replace`): every build counts as development. Pass `enabled` to both.
- `enabled: true` keeps them in production (a staging build); any boolean works as a switch.
- To drop their code from the bundle too, gate the imports:

  ```ts
  if (import.meta.env.DEV) {
    const { mountDevtools } = await import("@stesura/wordgard-dev-tools-panel");
    mountDevtools();
  }
  const config = [basicSchema(), ...(import.meta.env.DEV ? [wordgardDevtools()] : [])];
  ```

## Debugging with the panel

- An editor missing from the picker: its config lacks `wordgardDevtools()`, it isn't connected
  (not in the page), it's a production build, or the devtools turned themselves off (look for
  their console warning).
- In the page's console, `$wg` is the editor the panel shows, `$tr` the transaction selected in
  the Log.
- Log tab: press Record, reproduce, then "Copy as repro" for a Node script that replays the
  transactions on plain Wordgard and checks the resulting document: a bug report's schema,
  document and steps.
- Fields tab, amber "kept, not mapped": a `PointSet` or `RangeSet` field wasn't mapped through a
  change; usually a missing `set.map(tr.changes)` in the field's update.
- Each tab has a guide behind the ? in the tab bar; the project README has them too:
  https://github.com/stesura/wordgard-dev-tools#tabs
