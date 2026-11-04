# Wordgard DevTools — plan

Status: PARTIALLY EXECUTED. Phases 0, 1 and 2 done on 2026-11-04, see
[Implementation notes](#implementation-notes-phases-0-2-2026-11-04). Drafted 2026-11-04, revised
after a Fable review the same day, see [Review](#review-2026-11-04).

A browser DevTools panel for [Wordgard](../../../wordgard) editors, the counterpart of
`prosemirror-dev-tools` / `prosemirror-dev-toolkit`. MIT, its own public repo, sibling of
`../react-wordgard`.

## Why not port the PM toolkits

- Their editor discovery patches `pmViewDesc.updateChildren` (`prosemirror-dev-toolkit`'s
  `packages/extension/src/inject/pmViewDescHack.ts`, with random `setTimeout`s, and it skips
  custom node views), and every tab reads ProseMirror's model. Wordgard's model is facets,
  `GardState`, `ChangeSet`s and tiles. Only the UI ideas carry over.
- Three problems we are designing out:
  1. **Always listening.** The old toolkit injected a content script into every page
     (`<all_urls>`, `all_frames`) and serialised and diffed every transaction. Here,
     nothing is injected until the panel opens, nothing is recorded unless the panel is
     recording, and serialisation happens only when the panel asks for it.
  2. **Can't find the editor.** Wordgard has no DOM → editor link (`wg-content.wgTile` is a
     `DocTile`, which holds no reference to the `Wordgard`). Editors register explicitly
     instead of being scraped from the DOM.
  3. **One editor only.** There is a registry of every connected editor, and the panel
     shows a picker.

## Scope (v1)

1. Doc tree with the selection marked in it.
2. Element picker, both ways (page → tree, tree → page highlight).
3. Transaction log with record/pause.
4. `$wg` / `$tr` in the console.
5. Per-update timing.
6. Copy as repro.

Out of scope: facet inspector, decorations view, undo/collab state (use `$wg`), input/DOM
event log (revisit with the IME plan), snapshot diff, react-wordgard component layer,
schema check.

## Packages

```
wordgard-devtools/            npm workspaces, MIT
  packages/devtools/          "wordgard-devtools": page-side, framework-free
  packages/panel/             "wordgard-devtools-panel": the React panel UI, transport-agnostic,
                              also mountable in-page
  packages/extension/         Chrome (and Firefox) extension: a thin shell around the panel
  demo/                       Wordgard + react-wordgard editors with the in-page panel docked
  docs/
```

### Two ways to run the panel

The panel talks to the agent through a `Transport` (`send(request) → Promise`,
`onPush(cb)`), so it doesn't know where it runs:

- **Extension**: DevTools panel ↔ `chrome.runtime` port ↔ bridge ↔ `postMessage` ↔ agent.
- **In-page**: `mountDevtools({parent?})` from `wordgard-devtools-panel` mounts a dock at the
  bottom of the page (resizable, collapsible to a button, like `prosemirror-dev-tools`). The
  transport calls the agent directly in the same window, with no `postMessage`.
  - It renders in a shadow root, so its Tailwind CSS can't leak into the page and the page's
    CSS can't leak into it.
  - The dock is outside every editor's `contentDOM`, so Wordgard's DOM observer never sees it.
  - The theme follows `prefers-color-scheme` instead of the DevTools theme, with the same
    manual toggle.
  - The demo uses this mode. It is also useful to people who can't install the extension:
    a deployed demo, Safari, other browsers.

The panel is usable from Phase 3 in the demo without building the extension, which makes
the extension shell the last piece rather than the first.

During development, `wordgard` and `@stesura/react-wordgard` are local path dependencies on
`../wordgard` and `../react-wordgard`. `wordgard` is a peer dependency of `wordgard-devtools`.

## Page side: `wordgard-devtools`

### Registration

```ts
import {wordgardDevtools} from "wordgard-devtools"
Wordgard.create({state: GardState.create({extensions: [..., wordgardDevtools({name: "body"})]})})
```

- `wordgardDevtools()` returns a `Wordgard.Plugin`. `connect(wg)` adds the editor to the
  registry and `disconnect(wg)` removes it, so remounts and sub-editors are handled by
  Wordgard's own lifecycle. (Wordgard has no `destroy()`; `setConnected` is driven by the
  custom element's connected/disconnected callbacks, and a reconfigure that drops the plugin
  calls `disconnect` then `remove`.)
- Registry: `window.__WORDGARD_DEVTOOLS__`, keyed by the `Wordgard` instance
  (`Map<Wordgard, Entry>`), not by plugin. Each `wordgardDevtools()` call returns a new plugin,
  and facet dedupe only removes duplicates of the same object, so react-wordgard's automatic
  plugin and an app's own one would otherwise give two entries. A second `connect` for a known
  editor only updates the name. An entry is removed when `wg.connected` is false.
- An entry is `{id, name, wg, attached, recording}`. The name comes from the option, falling
  back to the editor's `aria-label` (set from `Wordgard.label`), then `editor #n`.
- **Several copies on one page.** The app and react-wordgard may bundle different versions.
  The stable contract is the registry (`register`, `unregister`, `subscribe`, `editors`,
  duck-typed, with its own `registryVersion`). Only the copy that created the registry installs
  the agent (`registry.agent`). Later copies only register editors. The panel reports the agent
  version.
- Editors created before the extension was installed or opened are covered: the registry lives
  on `window` from the first connect, and the bridge reads it when the panel opens.
- Cost when no panel is attached: one map insert per connect, one `message` listener, and two
  boolean checks per update.

### Listening

- The extension statically includes a `Wordgard.transactionListener` and a
  `Wordgard.updateListener`, each behind its own flag:
  - `attached` (the panel is connected and this editor is selected): `updateListener` pushes
    `stateChanged`, so the tree and selection stay live without recording.
  - `recording`: `transactionListener` feeds the log and the timers run.
- **Deviation from the chat discussion:** we don't add the listeners through a compartment
  on attach. A reconfigure is an effect on a dispatched transaction, which the app's own
  listeners (collab, track changes, history) would see, and `dispatch` throws during a flush.
  A static listener behind a boolean costs one call plus `runTransactionListeners`'s map
  set/delete per dispatch.
- `transactionListener` runs synchronously in `dispatch`, but a listener that dispatches
  re-entrantly can make Wordgard deliver several dispatches' transactions in one call. Log
  entries are per transaction, not per call. `updateListener` runs after the rAF flush, and
  one `Update` may batch several transactions.

### Agent and protocol

- The agent answers requests over `window.postMessage`, tagged
  `{source: "wordgard-devtools", v: PROTOCOL}`. On a protocol mismatch the panel shows
  "page agent x, panel expects y" instead of failing silently.
- Every handler is wrapped in try/catch and replies `{error}`, which the panel shows inline.
  Reads such as `nodeDOM`, `coordsAtPos` and `domAtPos` throw when the editor is disconnected or
  mid-flush, `posAtDOM` throws for DOM outside the content, and `ReactWordgard.flush` rethrows
  `RefusedUpdate`.
- The serialisers are loaded with a dynamic `import()` on the first panel connect, so pages
  that never open the panel don't load them.
- Requests: `listEditors`, `select(id)`, `children(id, paths[])` (batched),
  `node(id, path)`, `selection(id)`, `record(id, on)`, `clear(id)`, `log(id, range)`,
  `entry(id, index)`, `highlight(id, path | null)`, `pick(on)`, `setConsole(id, index?)`,
  `repro(id)`.
- Pushes: `editorsChanged`, `stateChanged(id, {docChanged, selectionSet})`, `picked(id, path)`,
  `logAppended(id, count)`.

### Serialisation and positions

- Shallow by default. A tree node is
  `{path, name, from, to, childCount, marks, paramPreview, textPreview}`. Children are sent only
  when requested. Text and param previews are truncated (e.g. 80 chars). The full value is sent
  on `node()`.
- Position rules: the doc has no boundary tokens (`Doc.length = contentLength`), and each
  plot adds 1 on each side (`length = 2 + contentLength`). pos → path (selection marking, picker
  results) uses `doc.resolve(pos)` instead of a second hand-written walk.

## Extension

- MV3, built with WXT (Chrome and Firefox from one codebase, Vite-based).
- **No static content script.** When the panel opens, the background worker injects the bridge
  with `chrome.scripting.executeScript({target: {tabId: inspectedWindow.tabId, allFrames: true}})`
  (`scripting` permission + `host_permissions`), and injects it again on navigation while the
  panel is open. The bridge is an isolated-world script. It receives the page agent's `message`
  events directly, because both worlds share `window`, and holds a `chrome.runtime` port to the
  panel. No `MAIN`-world script is needed, which also avoids Firefox's `world: "MAIN"` (128+)
  requirement.
- Iframes: one bridge per frame. Editors are listed per frame (`frameId` + editor id).
- The panel is a `chrome.devtools.panels.create` page. It is a separate document, so its CSS
  and React never touch the inspected page.
- UI: React 19, shadcn on Base UI, Tailwind v4. Compact density like Chrome's own panels.
  System UI font for the chrome, monospace for data.
- Theme: "follow DevTools" (`chrome.devtools.panels.themeName`) by default, plus a manual
  light/dark toggle. Tokens are CSS variables. The choice is kept in `chrome.storage.local`.

## Features

### 1. Doc tree and selection

- `@headless-tree/core` + `@headless-tree/react` with `asyncDataLoaderFeature`,
  `hotkeysCoreFeature` and `searchFeature`. The visible rows go to `@tanstack/react-virtual`.
- Item id = frame + editor id + path. On `stateChanged` with `docChanged`, the panel coalesces
  pushes per animation frame, invalidates the loaded children, and refetches the expanded items
  with one batched `children()` call. Expanded items whose path no longer resolves are
  collapsed.
- The selection is shown in a strip above the tree (anchor, head, type, from the selection's
  `toJSON`), and the nodes containing it are marked in the tree.
- A side pane shows the full node of the focused row: name, param, marks, from/to and JSON.

### 2. Element picker

- Tree → page: hovering a row calls `highlight`, and the agent draws a fixed-position overlay.
  Block nodes use `wg.nodeDOM(from)`. Text leaves use `domAtPos` + `Range.getClientRects()`
  (`nodeDOM` returns null for text, and a wrapped leaf needs several rects). The overlay is
  appended to `document.body`, outside `contentDOM`, which is the only thing Wordgard's DOM
  observer watches. It has `pointer-events: none`.
- Page → tree: in pick mode the agent adds capture-phase listeners on `window` for
  `pointerdown`, `mousedown`, `mouseup` and `click`. Each calls `preventDefault` and
  `stopPropagation`. Wordgard starts the mouse selection on `mousedown` (bubbling listeners on
  `contentDOM`), so suppressing `click` alone would let the caret move and log a
  `select.pointer` transaction. `mousemove` resolves the hovered node with
  `wg.nodeFromDOM(el)` (an Element: text targets use `parentElement`) and then
  `doc.resolve`. On click, the panel selects that editor, expands the path and scrolls to the
  row. Escape leaves pick mode.

### 3. Transaction log

- Record/pause button per editor, off by default. Nothing is snapshotted on record start.
- A ring buffer (default 500, configurable) keeps references to `Transaction`s, so
  serialisation is deferred. Each `Transaction` holds its `startState` and state, and docs
  share structure, so 500 entries are cheap. The buffer is dropped when its editor disconnects,
  and on `clear`.
- Each entry shows: index, time (`Transaction.time`), `userEvent`, appended
  (`Transaction.appended`), doc changed, selection set, effect count and annotation count.
- Opening an entry shows `changes.toJSON()`, a before/after of the touched ranges taken from
  `startState.doc` and `state.doc`, the selection, and the effect and annotation values,
  serialised safely (depth and cycle limits).
- **Deviation from the chat discussion:** no jsondiffpatch in v1. The `ChangeSet` already says
  what changed. Diffing a large doc's JSON is the cost we're avoiding.

### 4. `$wg` / `$tr`

- When an editor is selected in the panel, the agent defines `window.$wg` as a getter that
  returns that editor. When a log entry is opened, `window.$tr` returns that entry's
  transaction. A "log to console" button prints the selected node or entry.

### 5. Per-update timing

- While recording, the agent sets own-property wrappers on the instance, and deletes or
  restores them on pause:
  - **flush**: `wg.flush`, which both the rAF callback and `ensureFlushed` look up on the
    instance. This is exact, and it also covers `ReactWordgard`, which overrides `flush` on its
    prototype.
  - **dispatch**: `dispatch` is bound as an own property in the constructor, and internal
    callers go through `wg.dispatch`. The timer handles nesting. App code that captured
    `wg.dispatch` before recording started bypasses the wrapper.
- Flushes forced by the agent's own reads (`ensureFlushed` from `nodeDOM`/`coordsAtPos`) are
  tagged so they aren't blamed on the app.
- Updates over 16 ms are flagged in the log. There is a timeline strip above the log.

### 6. Copy as repro

- It produces a standalone script on plain Wordgard, runnable in Node:
  - The snapshot is `oldest.startState.toJSON()`, taken at `repro()` time from the oldest
    entry still in the buffer. This means no eager full-doc serialisation, and the snapshot
    stays correct after the ring buffer wraps.
  - The script calls `GardState.fromJSON(snapshot, [schema])` on a **schema-only**
    configuration, then dispatches every recorded transaction, appended ones included, as
    `{changes: ChangeSet.fromJSON(schema, json), selection: cx => GardSelection.fromJSON(cx, json), userEvent}`.
    The recorded changes already include extenders' contributions, and appenders' transactions
    are recorded separately. Replaying on the app's own extensions would apply both twice.
  - It ends with a check that the final doc equals the recorded one.
- Text and node selection types are always registered, so selection JSON resolves without
  extra extensions. Custom selection types need their extension in the config, and the
  script's header says so.
- Limits, stated in the script's header comment: the schema is a placeholder the user fills
  in, and effects are dropped, because they have no stable names to serialise.
- The goal is the format that `react-wordgard/docs/wordgard-upstream-bugs.md` asks for: schema,
  doc and steps.

## react-wordgard integration

- react-wordgard adds `wordgardDevtools()` automatically in development builds. Opt out with a
  prop. Done in the react-wordgard repo once `wordgard-devtools` is published. Registry keying by
  instance makes an app's own `wordgardDevtools()` harmless.

## Phases

0. **Executed.** Repo scaffold: workspaces, WXT, demo page (Vite, a plain Wordgard editor, a
   react-wordgard editor, two editors side by side), CI (typecheck, unit tests, build).
1. **Executed.** `wordgard-devtools`: registry, plugin, listeners, protocol with error replies,
   shallow serialisers. Unit tests against real Wordgard instances, including two plugins on one
   editor and two package copies on one page.
2. **Executed.** `wordgard-devtools-panel` shell: the `Transport` interface, the in-page
   transport and `mountDevtools()` (shadow root, dock, collapse), editor list and picker, theme.
   Docked in the demo.
2b. Extension shell: on-demand injection, bridge, `chrome.runtime` transport, frames, protocol
   handshake, DevTools theme. Can run after any later phase.
3. Doc tree and selection.
4. Element picker.
5. Transaction log and timing.
6. `$wg` / `$tr`.
7. Copy as repro, tested by running the generated script in Node.
8. react-wordgard automatic registration (react-wordgard repo).
9. Publishing: npm package and extension stores.

E2E: Playwright with the built extension loaded (`--load-extension`, persistent context)
against the demo. It covers two editors, switching between them, remounting, iframes, editors
created before the panel opened, and picking without moving the caret.

## Open questions

1. **Dev-mode detection in react-wordgard.** `process.env.NODE_ENV` or a `devtools` prop
   defaulting to off? react-wordgard currently has no dev/prod switch.
2. **Dependency shape.** Should react-wordgard depend on `wordgard-devtools`, or take
   `wordgardDevtools()` as an optional peer passed in by the app?
3. **Timing hook.** The `flush`/`dispatch` wrappers work today. If Wordgard renames or rebinds
   them, ask its author for a supported hook rather than patching deeper.
4. **Effects in repro.** Is there a way to name effect types (e.g. a devtools-only registry)?
   Or do we accept dropping them?
5. **React in the in-page panel.** Should `wordgard-devtools-panel` bundle its own React, so it
   works on any page whatever React version the page uses (or none), or take React 19 as a
   peer? Bundling is simpler and costs nothing until `mountDevtools()` lazy-loads it.
   Recommendation: bundle.

## Review (2026-11-04)

Fable reviewed the first draft. Every finding was checked against the Wordgard and
react-wordgard source and accepted:

1. Picker suppressed only `click`, but selection starts on `mousedown`. Fixed: capture
   `pointerdown`/`mousedown`/`mouseup`/`click`.
2. The tree only updated while recording. Fixed: separate `attached` and `recording` flags.
3. The static content script on every page was the "always listening" cost. Fixed: inject on
   panel open, isolated world only.
4. Replaying repro transactions on the app's extensions double-applies extenders and appenders.
   Fixed: schema-only replay.
5. Repro selection must be a function, and the record-start snapshot broke after the buffer
   wrapped. Fixed: `cx => GardSelection.fromJSON(cx, json)`, snapshot from the oldest entry's
   `startState`.
6. Two devtools plugins on one editor gave duplicate entries. Fixed: registry keyed by instance.
7. Two package copies would both answer requests. Fixed: only the registry's creator runs the
   agent.
8. "First plugin update" missed the start of the flush. Fixed: wrap `wg.flush` instead.
9. Agent reads can throw. Fixed: error replies.
10. Smaller points folded in: `nodeFromDOM` takes an Element, text overlays use client rects,
    position rules plus `doc.resolve`, coalesced and batched refetches, transactions logged
    per transaction, the toolkit path corrected, and memory notes.

## Implementation notes: phases 0-2 (2026-11-04)

Checks at the end: `npm run typecheck`, `npm test` (devtools 22 tests, panel 9, Chromium through
Vitest browser mode) and `npm run build` (devtools, panel, extension for chrome-mv3 and
firefox-mv3, demo) pass. The demo was also driven in Chromium: switching editors, live updates
while typing, remounting the react-wordgard editor, theme toggle, collapse.

### Deviations and things that didn't hold up

- **Local paths.** `../wordgard` ships no `dist/`: it needs `npm install --no-package-lock` once
  (its `prepare` builds it; npm 12 blocks that script when this repo installs). npm doesn't
  install the dependencies of `file:` links outside the repo, so the siblings must have their own.
  CI fills `../wordgard` and `../react-wordgard` from their npm tarballs (`0.6.2`, `0.1.0`).
- **Source condition.** Packages export `src/` under a `source` condition, used by Vite, Vitest
  and tsc (`customConditions`). Nothing needs building before the demo or the tests run.
- **One copy of each.** `../react-wordgard` has its own `node_modules` (wordgard, React 18):
  the demo dedupes `wordgard`, `react` and `react-dom` in Vite, and maps their types in its
  tsconfig.
- **shadcn.** Its CLI fails to install dependencies inside npm workspaces, so the components
  were generated in a scratch project and copied. The `base-nova` style uses the `cn` package
  (not clsx + tailwind-merge). Aliases are package `imports` (`#components/*`) rather than `@/`,
  so the source works from the demo's Vite too. The components were converted to arrow functions.
  Their popups portal into the panel's root (`components/portal.tsx`).
- **Registration on reconfigure.** "A reconfigure calls `disconnect` then `remove`" holds for
  removal only. A plugin *added* by a reconfigure while connected never gets `connect`: Wordgard
  calls it before creating the plugin's value. The plugin also registers from its constructor when
  the editor is already connected. Entries are counted per connected plugin, so a reconfigure that
  drops one of two plugins keeps the entry.
- **Duplicate listeners.** The update and transaction listener extensions are module-level, so
  one copy's plugins share them and the facets dedupe them. Across copies the agent dedupes
  `updated` by `Update` identity.
- **Requests of later phases** (`clear`, `log`, `entry`, `highlight`, `pick`, `setConsole`,
  `repro`) reply "Not implemented yet (plan phase n)".
- **Panel summary.** Phase 2 shows a small summary of the attached editor (top-level nodes and the
  selection's JSON), so switching editors can be seen working. Phase 3's tree replaces it.
- **In-page registry.** The in-page transport creates the registry when no editor has connected
  yet, so the panel can mount first; the panel's copy of `wordgard-devtools` then owns the agent.
- **Shadow root.** Browsers ignore `@property` in shadow trees, and Tailwind v4 relies on it for
  its `--tw-*` defaults: the adopted stylesheet restates the initial values under
  `@layer properties`. Spacing and text sizes are in px, so the page's root font size doesn't
  scale the panel. The host has `all: initial`.
- **Picker and remounts.** The panel follows the user's pick: by id when the same instance
  reconnects, by name when a remount creates a new instance (react-wordgard does). Base UI's
  Select reports value changes it makes itself (reason `"none"`); only the user's picks count.
- **Collapse detaches.** A collapsed dock stops listening and sends `select(null)`. Stale replies
  after a stop are dropped, so they can't re-attach an editor.
- **React is bundled** in the panel's build (open question 5's recommendation); the lazy chunk is
  about 1.2 MB unminified (library builds aren't minified).
- **Extension.** Firefox is built as MV3 too (WXT defaults Firefox to MV2), with a placeholder
  gecko id. The DevTools panel page is a placeholder until phase 2b. Icons are WXT's defaults.

### Open points

- CI has not run yet: the sibling-tarball step and `npm ci` with the `file:` links in the lockfile
  are untested.
- Phase 5: `recorded` must dedupe by `Transaction` identity (two copies on one editor each
  deliver the same transactions).
- Phase 2b: the agent's `remote` flag never resets, so after an extension panel has connected once,
  pushes keep going over `postMessage` (cheap: nothing is attached once the panel detaches). The
  theme choice moves to `chrome.storage.local` there.
- The version in `packages/devtools/src/version.ts` is a constant, checked against
  `package.json` by a test.
