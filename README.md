# Wordgard DevTools

A DevTools panel for Wordgard editors. Use it to inspect the
document, the state, the rendered DOM, the schema and the state fields, and to record transactions
with their timing.

It runs in two ways:

- **as a browser extension**: a "Wordgard" tab in Chrome or Firefox DevTools;
- **in the page**: a panel docked at the bottom of your app, for browsers without the extension
  or for a deployed demo.

> Status: work in progress, not yet published to npm or the extension stores.

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [Inspiration](#inspiration)
- [Usage](#usage)
  - [1. Register your editors](#1-register-your-editors)
  - [2. Mount the panel](#2-mount-the-panel)
  - [Keep it out of production](#keep-it-out-of-production)
- [Packages](#packages)
- [Development](#development)
- [License](#license)

## Quick start

```sh
npm install -D @stesura/wordgard-dev-tools @stesura/wordgard-dev-tools-panel
```

Add the plugin to your editor and dock the panel:

```ts
import {Wordgard} from "wordgard/editor"
import {basicSchema} from "wordgard/schema"
import {wordgardDevtools} from "@stesura/wordgard-dev-tools"
import {mountDevtools} from "@stesura/wordgard-dev-tools-panel"

Wordgard.create({parent, doc, config: [basicSchema(), wordgardDevtools()]})
mountDevtools()
```

Run your dev server: the panel is docked at the bottom of the page. Both calls do nothing in
production builds (see [Keep it out of production](#keep-it-out-of-production)).

## Features

- **Editor picker**: every connected editor on the page, iframes included.
- **Structure**: the document as nested boxes with positions. The selection is marked. Hovering a
  box outlines its node in the page.
- **Element picker**: click a node in the page to find it in the panel. Picking doesn't move the caret.
- **State**: the editor's state as collapsible JSON.
- **View**: the editor's status and its content DOM. Each element shows the node it draws.
- **Schema**: node and mark types with their groups, content and attributes.
- **Fields**: each `GardState.Field` with its value and its history of changes.
- **Log**: recorded transactions with their changes, selection, effects and annotations. Shows
  per-update timing and flags updates over 16 ms.

Nothing runs until the panel opens, and nothing is recorded until you press record.

## Inspiration

Inspired by [prosemirror-dev-tools](https://github.com/d4rkr00t/prosemirror-dev-tools), rebuilt for
Wordgard's model. Changes to make it easier to use:

- **Multiple editors**: one panel for every editor on the page, iframes included, with a picker.
- **Element selector**: pick a node in the page to reveal it in the panel.
- **Highlighting**: hovering or selecting a node outlines it in the page.
- **Positions**: every node shows its from/to positions, and text in the DOM shows where it sits.
- **Dock position**: dock the in-page panel at any side, with resizable panes.
- **Pause**: stops the panel from reading the editor, so it doesn't affect performance.
- **Low overhead**: nothing is injected until the panel opens, and nothing is recorded until you
  press record.
- **Timing**: each update is timed, and slow ones (over 16 ms) are flagged in the log.
- **Fields**: plugin state with its history of changes, linked to the transaction log.
- **View**: the content DOM, with the node each element draws.
- **Filters and links**: search and filters in the tabs, links between them (a field change opens
  its transaction).
- **Isolation**: the in-page panel renders in a shadow root, so its styles and the page's don't
  affect each other.
- **Extension**: runs as a browser DevTools tab, or docked in the page.
- **Light and dark mode**: follows the system or the DevTools theme, with a manual toggle.

## Usage

### 1. Register your editors

Editors register explicitly with the `wordgardDevtools()` plugin from `@stesura/wordgard-dev-tools`:

```ts
import {Wordgard} from "wordgard/editor"
import {wordgardDevtools} from "@stesura/wordgard-dev-tools"

Wordgard.create({
  parent,
  doc,
  config: [
    basicSchema(),
    wordCount,
    wordgardDevtools({name: "main", fields: {wordCount}}),
  ],
})
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | `string` | the editor's `aria-label`, then `editor #n` | Shown in the panel's editor picker. |
| `fields` | `{[name: string]: GardState.Field}` | none: fields show as `field #n` | Names the editor's state fields in the Fields tab. |
| `enabled` | `boolean` | `false` in production builds, `true` otherwise | Whether to register the editor. See [Keep it out of production](#keep-it-out-of-production). |

With react-wordgard, add the plugin to the `config` you pass to `<WordgardEditor>`.

`wordgard` (`>=0.6.2 <1`) is a peer dependency.
If a newer Wordgard breaks the devtools, they turn themselves off
with one console warning; your editor keeps working.

### 2. Mount the panel

```ts
import {mountDevtools} from "@stesura/wordgard-dev-tools-panel"

mountDevtools()
```

The panel docks at the bottom of the page.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `parent` | `Element` | `document.body` | The element the panel goes in. Keep it outside your editors. |
| `enabled` | `boolean` | `false` in production builds, `true` otherwise | Whether to mount the panel. See [Keep it out of production](#keep-it-out-of-production). |
| `transport` | `Transport` | the in-page transport | How the panel talks to the page. Only for custom hosts. |

It returns a handle:

| Field | Type | Description |
| --- | --- | --- |
| `unmount` | `() => void` | Removes the panel, for example on a route change in a single-page app. |
| `ready` | `Promise<void>` | Resolves once the panel has rendered. |
| `host` | `HTMLElement` | The `<wordgard-devtools>` element; the panel renders in its shadow root. |

The panel renders in a shadow root, so its styles and your page's styles don't affect each other.
Its React UI is bundled with it and loaded lazily on the first `mountDevtools()` call. Your page
doesn't need React.

### Keep it out of production

Both are off in production builds (when your bundler sets `process.env.NODE_ENV` to
`"production"`, as Vite, webpack and Next do):

- `wordgardDevtools()` adds nothing to the editor's config, so the editor isn't registered and
  no panel sees it.
- `mountDevtools()` mounts nothing and downloads nothing. The panel's chunks are still emitted but
  never loaded.

Pass `enabled` to either one to decide yourself:

```ts
wordgardDevtools({enabled: true}) // keep it in production, e.g. on a staging build
mountDevtools({enabled: settings.debug}) // your own switch
```

Without a bundler (plain ES modules, import maps) or with one that doesn't set `NODE_ENV` (Rollup
without `@rollup/plugin-replace`), every build counts as development: pass `enabled` there.

Their small page-side code still ships. To drop it as well, gate the calls so your bundler removes
them:

```ts
if (import.meta.env.DEV) {
  const {mountDevtools} = await import("@stesura/wordgard-dev-tools-panel")
  mountDevtools()
}

const config = [basicSchema(), ...(import.meta.env.DEV ? [wordgardDevtools()] : [])]
```

## Packages

| Package | What it is |
| --- | --- |
| [`@stesura/wordgard-dev-tools`](packages/devtools) | Page side, framework-free. The plugin, the editor registry and the agent that answers the panel. |
| [`@stesura/wordgard-dev-tools-panel`](packages/panel) | The React panel and `mountDevtools()`. It uses a `Transport`, so it doesn't depend on where it runs. React is bundled, so pages need neither React nor a particular version. |
| [`packages/extension`](packages/extension) | The WXT extension shell around the panel. |
| [`demo`](demo) | A Vite page with several editors and the in-page panel docked. |

## Development

This repository expects `wordgard` and
[`react-wordgard`](https://github.com/stesura/react-wordgard) to be checked out next to it. They are
local path dependencies.

```sh
(cd ../wordgard && npm install --no-package-lock)   # builds its dist/
npm install
npx playwright install chromium                      # once, for the tests

npm run dev          # the demo, with the panel docked
npm run typecheck
npm test             # Vitest in Chromium
npm run build        # packages, extension (Chrome and Firefox) and demo
npm run e2e -w wordgard-devtools-extension   # the extension's panel against the demo
```

To try the browser extension, load it unpacked from `packages/extension/.output/chrome-mv3`
(Chrome) or `firefox-mv3` (Firefox) after `npm run build`, then open the **Wordgard** tab in
DevTools.

Node 22.12 or later. The design and its progress are in
[docs/partially-executed/plan.md](docs/partially-executed/plan.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute, and [SECURITY.md](SECURITY.md) to report a
vulnerability.

## License

[MIT](LICENSE). The panel package and the extension bundle third-party code; their builds include
its licences in `THIRD_PARTY_LICENSES.txt`. The components in
[packages/panel/src/components/ui](packages/panel/src/components/ui) are copied from shadcn/ui
([MIT](packages/panel/src/components/ui/LICENSE.md)).
