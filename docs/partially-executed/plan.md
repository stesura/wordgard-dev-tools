# Wordgard DevTools — plan

Status: PARTIALLY EXECUTED. Phases 0, 1, 2, 2b, 3, 4, 4b, 5, 5b and 5c done on 2026-11-04, see the
implementation notes for [0-2](#implementation-notes-phases-0-2-2026-11-04),
[2b](#implementation-notes-phase-2b-2026-11-04), [3](#implementation-notes-phase-3-2026-11-04),
[4](#implementation-notes-phase-4-2026-11-04), [4b](#implementation-notes-phase-4b-2026-11-04),
[5](#implementation-notes-phase-5-2026-11-04) and [5b and 5c](#implementation-notes-phases-5b-and-5c-2026-11-04). Phase 9 partially
executed on 2026-11-06 (npm side; the extension stores are parked), see
[Packaging and publishing](#packaging-and-publishing-2026-11-06). Drafted 2026-11-04, revised
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
schema check. Added later at the user's request (2026-11-04): a Structure tab (4b), a Schema tab
(5b) and a Fields tab (5c).

## Packages

```
wordgard-devtools/            npm workspaces, MIT
  packages/devtools/          "@stesura/wordgard-dev-tools": page-side, framework-free
  packages/panel/             "@stesura/wordgard-dev-tools-panel": the React panel UI,
                              transport-agnostic, also mountable in-page
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
`../wordgard` and `../react-wordgard`. `wordgard` is a peer dependency of `@stesura/wordgard-dev-tools`
(`>=0.6.2 <1` since 2026-11-06, see [Wordgard versions](#wordgard-versions)).

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
  and facet dedupe only removes duplicates of the same object, so two plugins on one editor (two
  libraries each adding one) would otherwise give two entries. A second `connect` for a known
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
  `logChanged(id, end)` (planned as `logAppended(id, count)`; see phase 5's notes).

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

- **Dropped (2026-11-05, the user's decision):** react-wordgard doesn't add `wordgardDevtools()`
  automatically. Apps add it to the `config` they pass to `<WordgardEditor>`, as with plain
  Wordgard. react-wordgard stays free of any devtools dependency.

## Phases

0. **Executed.** Repo scaffold: workspaces, WXT, demo page (Vite, a plain Wordgard editor, a
   react-wordgard editor, two editors side by side), CI (typecheck, unit tests, build).
1. **Executed.** `wordgard-devtools`: registry, plugin, listeners, protocol with error replies,
   shallow serialisers. Unit tests against real Wordgard instances, including two plugins on one
   editor and two package copies on one page.
2. **Executed.** `wordgard-devtools-panel` shell: the `Transport` interface, the in-page
   transport and `mountDevtools()` (shadow root, dock, collapse), editor list and picker, theme.
   Docked in the demo.
   2b. **Executed.** Extension shell: on-demand injection, bridge, `chrome.runtime` transport, frames, protocol
   handshake, DevTools theme. Can run after any later phase.
3. **Executed.** Doc tree and selection.
4. **Executed.** Element picker.
   4b. **Executed.** Structure tab (added 2026-11-04): the panel gets a tab bar (Tree | Structure). Structure draws
   the whole document as nested boxes, as `prosemirror-dev-tools`'s Structure tab does: each node
   with its name and its from/to positions, blocks nested, inline content as chips in a row. The
   nodes holding the selection are marked; hovering a box outlines its node in the page; clicking
   one shows it in the side pane; a pick reveals it there too. One `structure(id)` request sends
   the document's shallow nodes nested (developers' documents: no paging).
5. **Executed.** Transaction log and timing.
   5b. **Executed.** Schema tab (added 2026-11-04): the editor's node and mark types: names, groups, what each
   holds, parameters, mark targets, from the state's schema (public API).
   5c. **Executed.** Fields tab (added 2026-11-04): each `GardState.Field` (Wordgard's plugin state) with its value,
   when it last changed, and its history of changes linked to the transaction log. Fields are
   found through `state.config.base` (public); they have no names, so they show as "field #n"
   unless the app names them: `wordgardDevtools({fields: {history: historyField}})` (the shape
   `GardState.toJSON(fields)` takes). Changes are found by comparing each field's value per
   update, only while the tab is shown or the log records.
6. `$wg` / `$tr`.
7. Copy as repro, tested by running the generated script in Node.
8. ~~react-wordgard automatic registration (react-wordgard repo).~~ Dropped (2026-11-05): apps
   add the plugin themselves. See [react-wordgard integration](#react-wordgard-integration).
9. **Partially executed** (2026-11-06). Publishing: the npm packages are ready (metadata,
   release workflow, lockstep versions, Wordgard version support); the extension stores are
   parked. See [Packaging and publishing](#packaging-and-publishing-2026-11-06).

E2E: Playwright with the built extension loaded (`--load-extension`, persistent context)
against the demo. It covers two editors, switching between them, remounting, iframes, editors
created before the panel opened, and picking without moving the caret.

## Open questions

1. **Dev-mode detection in react-wordgard.** `process.env.NODE_ENV` or a `devtools` prop
   defaulting to off? react-wordgard currently has no dev/prod switch.
   Closed (2026-11-05): react-wordgard doesn't add the plugin. The plugin and `mountDevtools()`
   are off in production builds unless `enabled: true`. See
   [Production builds](#production-builds-2026-11-05).
2. **Dependency shape.** Should react-wordgard depend on `wordgard-devtools`, or take
   `wordgardDevtools()` as an optional peer passed in by the app?
   Closed (2026-11-05): neither, react-wordgard has no devtools dependency.
3. **Timing hook.** The `flush`/`dispatch` wrappers work today. If Wordgard renames or rebinds
   them, ask its author for a supported hook rather than patching deeper.
4. **Effects in repro.** Is there a way to name effect types (e.g. a devtools-only registry)?
   Or do we accept dropping them?
5. **React in the in-page panel.** Should `wordgard-devtools-panel` bundle its own React, so it
   works on any page whatever React version the page uses (or none), or take React 19 as a
   peer? Bundling is simpler and costs nothing until `mountDevtools()` lazy-loads it.
   Recommendation: bundle.
   Closed (2026-11-06): bundled, production React only, and React is a devDependency. See
   [Packaging and publishing](#packaging-and-publishing-2026-11-06).

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
  removal only. A plugin _added_ by a reconfigure while connected never gets `connect`: Wordgard
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
  about 1.2 MB unminified (library builds aren't minified). Superseded on 2026-11-06: production
  React only, about 0.9 MB, see [Packaging and publishing](#packaging-and-publishing-2026-11-06).
- **Extension.** Firefox is built as MV3 too (WXT defaults Firefox to MV2), with a placeholder
  gecko id. The DevTools panel page is a placeholder until phase 2b. Icons are WXT's defaults.

### Open points

- ~~CI has not run yet~~: see "CI (2026-11-04)" at the end.
- ~~Phase 5: `recorded` must dedupe by `Transaction` identity~~ (done in phase 5, per editor).
- Phase 2b: the agent's `remote` flag never resets, so after an extension panel has connected once,
  pushes keep going over `postMessage` (cheap: nothing is attached once the panel detaches). The
  theme choice moves to `chrome.storage.local` there.
- The version in `packages/devtools/src/version.ts` is a constant, checked against
  `package.json` by a test.

## Implementation notes: phase 2b (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 25, panel 11, extension 11); `npm run
build`; `npm run e2e -w wordgard-devtools-extension` (4 tests: the built extension against the
built demo in Chromium, now in CI). A Fable audit followed; its accepted findings are fixed below.

### How it works

- **Background** (`packages/extension/src/background.ts`) keeps one panel port per tab and one
  bridge port per frame. A panel's `init` injects the bridge into all frames; while the panel is
  open, `webNavigation.onDOMContentLoaded` injects it into each frame that loads. When the panel's
  port closes, the tab's bridges are disconnected. Permissions: `scripting`, `webNavigation`,
  `storage`, host `<all_urls>`.
- **Bridge** (`src/bridge.ts`, an unlisted script, 1.3 KB, no Wordgard) relays the agent's
  postMessage protocol to its port. On connect it pings the page; a second injection reconnects
  and pings again; a bfcache restore (`pageshow` with `persisted`) reconnects. When its port
  closes it posts `detach`.
- **Agent additions** (deviation): it posts `announce` (version, protocol) when created and when
  pinged, so a bridge finds an agent created before or after it, and the panel only asks frames
  that have one. That is one `postMessage` per page load even when no panel ever opens, beyond the
  plan's "one map insert per connect, one message listener".
- **Selection per client** (deviation, from the audit): `attached` was global, so the extension
  and the in-page dock detached each other's editor. The agent now keeps one selection for direct
  callers (the dock) and one for postMessage (the extension); `attached` means either. `detach`
  clears only the extension's.
- **Frames transport** (`src/frames-transport.ts`): one `Transport` over every frame. Panel ids
  map to (frame, page id); a frame that goes away, or a dropped connection, forgets its ids, so a
  new document's editors are never mistaken for the old ones. Requests time out after 10 s.
  `select` waits only for the target frame. A frame with another protocol, a frame that doesn't
  answer, or a page the bridge couldn't be injected into shows as a notice in the panel. Editors in
  iframes are labelled with their frame's URL. The protocol gained `EditorInfo.frame`,
  `listEditors`'s `notices`, and a nullable `agent`.
- **Panel connection** (`src/panel-connection.ts`): reconnects when the service worker restarts,
  which reinjects and reconnects the bridges, and pings every 20 s to keep it alive.
- **Theme**: follows `devtools.panels.themeName` (live through `setThemeChangeHandler` on
  Chrome); the choice is kept in `chrome.storage.local`. The panel's theme store takes a source
  and a storage, synchronous or not.
- **Panel package**: new `./ui` (the panel without the dock), `./transport` and `./styles.css`
  exports. `./ui` is internal since 2026-11-06, see
  [Packaging and publishing](#packaging-and-publishing-2026-11-06). The extension bundle has no Wordgard code (tree-shaken through `sideEffects: false`).
- **Demo**: an editor in an iframe (`demo/frame.html`). The in-page dock lists only the top
  page's editors; the extension lists all.
- **E2E**: opens the panel page as a tab with `?tabId=` (Playwright can't drive DevTools).

### Rejected or deferred audit findings

- Two panels for one tab: the background keeps one panel per tab. A browser gives a tab one
  DevTools; only the e2e's `?tabId=` tab could add a second. Not handled.
- A page can forge the protocol's messages (same window as the agent and the bridge). Inherent;
  the page can call the agent directly anyway.
- Replies from the page are typed `any` where they enter the extension (`src/messages.ts`): an
  unchecked boundary, equivalent to a cast, stated there.

### Open points

- Not run on Firefox: the bridge's `event.source` check and `event.data` in a content script,
  MV3 host permission grants (user-revocable there; a failed injection shows as a notice), and the
  theme, which Firefox reports only at load.
- Not exercised by tests: a service-worker restart, a bfcache restore, an injection failure in a
  real browser (the transport's handling is unit-tested).
- CI has still not run.

## Implementation notes: phase 3 (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 25, panel 23, extension 11, two
consecutive clean runs); `npm run build`; e2e 5 tests (a live-tree step added). Two Fable audits:
the first found the tree's cache broken (below), the second checked the rewrite.

### How it works

- `packages/panel/src/doc-source.ts` owns the tree's data, per editor: each loaded level is tagged
  with the document version. Levels requested while rendering are batched into one `children`
  request per tick. On a document change (pushes coalesced per animation frame) it refetches every
  expanded level in one request and drops every other cached level, which load again when
  expanded. Replies for an older version are dropped. Loads never reject: a failure shows
  "Couldn't load the tree" with Retry, keeps the previous rows, and isn't retried by rendering for
  2 s.
- `packages/panel/src/DocTree.tsx`: headless-tree with its **synchronous** loader over the source
  (`syncDataLoaderFeature`, `hotkeysCoreFeature`, `searchFeature`), expanded and focused items as
  React state, rows virtualized with `@tanstack/react-virtual` at a fixed 20 px. Levels that no
  longer resolve collapse; a focused node that's gone hands focus to its nearest remaining
  ancestor. The selection strip shows type, anchor and head, with Reveal (expands down to the head
  and focuses it). Rows holding the anchor or the head are marked. The side pane shows the focused
  node's `node()` detail (name, path, from–to, param or text, marks, JSON) through Suspense and
  `use()`, deferred so it doesn't flash while the next one loads.
- `node()` replies gained `json` (`toJSON()`, null for nodes longer than 10 000 positions: the
  document, usually).

### Deviations and things that didn't hold up

- **headless-tree's async loader** (`asyncDataLoaderFeature`, as planned) keeps its own cache,
  which can't be versioned: collapsed levels kept stale children forever, a deleted-then-replaced
  level stayed empty, and one failed request left the tree "loading" for good. Replaced by the sync
  loader over our own versioned source.
- **Search** covers loaded rows only. Its input mounts about 20 ms after the key that opens it
  (React gives updates from native listeners in a shadow root default priority); keys typed faster
  than that go to the tree. Human typing doesn't hit it; the test types at 50 ms per key.
- **Selection marking** marks the nodes holding the anchor and the head, not every node between
  them in a range. A caret at a text leaf's edge resolves to its paragraph (`Pos.inText` is 0), so
  the innermost marker moves between leaf and paragraph as the caret crosses leaf boundaries.
- **Path ids**: an insert before the focused node makes the side pane show whatever node is at
  that path now. Inherent to path ids (plan, "Item id = … + path").
- A refresh that removes the focused node can show "No node at path" for one frame before focus
  moves.

### Open points

- The 2 s retry delay for failed levels isn't covered by a test.

Out of scope: very large documents (thousands of top-level nodes). Every refresh resends each
expanded level whole, about 1.6 MB per frame of typing for 10 000 paragraphs over the extension.
The panel is for developers troubleshooting, not for documents that size.

## Implementation notes: phase 4 (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 37, panel 28, extension 12, two
consecutive clean runs); `npm run build`; e2e 7 tests (hover outline in the page; a pick in the
iframe's editor that leaves its caret where it was). A Fable audit followed; its findings are fixed
or noted below.

### How it works

- `packages/devtools/src/inspect.ts`, loaded with the serialisers: the outline is a fixed-position
  overlay on `document.body` (`pointer-events: none`, a label with the node's name), from the
  node's element box (`nodeDOM`) or, for text and element-less nodes, the client rects of a range
  between `domAtPos(from, 1)` and `domAtPos(to, -1)`. It follows scrolling and resizing.
- Pick mode listens in the capture phase on `window` (pointer, mouse, click, dblclick,
  contextmenu, keydown). Events whose composed path holds an editor's `contentDOM` are swallowed
  (`preventDefault` + `stopImmediatePropagation`); Chromium then skips the compatibility
  `mousedown`, so Wordgard never starts a selection, and the editor doesn't take focus. The node is
  `nodeFromDOM(target)`, refined to the text leaf under the pointer with `posAtCoords` (at a leaf
  boundary, the leaf on the pointer's side, if the pointer is over it). A click pushes
  `picked(id, path)`; picking ending any other way (Escape, a panel's `pick(false)`, the extension
  detaching) pushes the new `pickCancelled`, so every panel's Pick button stays in step.
- The panel: a Pick toggle. A pick selects the editor as the user's choice and reveals the node in
  its tree (also when the pick switched editors: the new tree takes the reveal on mount). A panel
  that didn't start picking ignores `picked`. Hovering a tree row outlines its node; leaving the
  tree hides it. `highlight` with `path: null` hides the outline whatever the id; the extension's
  transport sends it to every frame.

### Deviations

- Events are swallowed in editors' content only, not window-wide as planned: the in-page panel,
  the page around, and an editor's own panels, menu bar and dialogs (outside `contentDOM`) keep
  working in pick mode.
- `stopImmediatePropagation`, not `stopPropagation`. Listeners the page put in the capture phase on
  `window` before the picker still see the swallowed events (not `defaultPrevented`); inherent.
- The plan's "text targets use `parentElement`" isn't needed: event targets are elements.
- Escape cancels only in the page. In the extension, Escape in DevTools belongs to DevTools; the
  Pick button toggles off.

## Implementation notes: phase 4b (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 39, panel 40, extension 12, two
consecutive clean runs); `npm run build`; e2e 8 tests (a Structure step added). A Fable audit
followed; its findings are fixed below.

### How it works

- `structure(id)` (`packages/devtools/src/serialise.ts`) sends every node, nested, with text
  leaves' full text for searching. One request per document change, only while the tab is shown
  (catching up when shown). Developers' documents: no paging.
- `packages/panel/src/Structure.tsx`: blocks as boxes (a left border coloured by type, name,
  param, marks with values, from–to), a textblock's content as a row of chips (text or inline
  node, param, marks, from–to; an inline plot nests its own chips). Boxes holding the selection
  are shaded, the innermost outlined. Hover outlines the node in the page; click (or the arrow
  keys, Home and End: the view is a `tree` with roving focus) shows it in the side pane;
  double-click scrolls the node into view in the editor (`scrollIntoView` request: the node's
  element, `Element.scrollIntoView`, no transaction). A search box matches text, node names and
  params, with a count, Enter / Shift+Enter and previous/next buttons.
- Tabs (shadcn on Base UI), both kept mounted so the tree keeps its expanded rows. The active tab
  is in the store; only the shown tab takes a pick's reveal. The Structure's reveal waits for the
  structure to load (a pick that switched editors).
- The node pane and selection strip are shared (`node-pane.tsx`), as is the detail cache
  (`detail-cache.ts`).

### Also done at the user's request (2026-11-04)

- The toolbar's "agent x · protocol y" is gone; a mismatch still shows as a notice.
- The in-page dock docks on any side (bottom, right, top, left: a toolbar button cycles), its size
  remembered per axis. Narrow (left or right), the side pane goes under the content (a container
  query), and the toolbar wraps.

### Notes

- `PROTOCOL` stays 1 although `structure` and `scrollIntoView` were added: nothing is published,
  and a new panel against an old agent shows the "Unknown request" error inline.
- The vitest config pre-bundles the panel's dependencies: one discovered mid-run reloads the
  browser tests, which a cold CI cache would hit.

## Implementation notes: phase 5 (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 51, panel 45, extension 12, two
consecutive clean runs); `npm run build`; e2e 9 tests (a Log step: record, type in an editor, the
row with its flush timing, its entry). A Fable audit followed; its findings are below.

### How it works

- `packages/devtools/src/log.ts`, loaded with the serialisers: a ring buffer per editor (500 by
  default; `record(id, on, size?)` sets it) of `Transaction` references. Indices count up per
  editor and are never reused, `clear` included. `log(id, from, to)` serialises rows (index, time,
  userEvent, appended, docChanged, selectionSet, effect and annotation counts, timing);
  `entry(id, index)` the detail (`changes.toJSON()`, each `iterChangedRanges` range's tokens and
  text before and after, the selection set / before / after, effects and annotations through
  `toSafe`, named when they are Wordgard's own: `reconfigure`, `appendConfig`, `time`,
  `userEvent`, `addToHistory`, `remote`, `appended`). Transactions are deduped per editor by
  identity.
- Timing: own-property wrappers on `wg.flush` and `wg.dispatch` while recording. A dispatch's time
  (nested dispatches included) goes to the transactions recorded during the outermost call; a
  flush's time to those recorded since the previous flush, numbered so rows sharing a flush show
  it. Flushes forced while the agent handles a request, follows an outline or resolves a pick are
  tagged (`packages/devtools/src/reads.ts`, `byAgent`). Pausing restores `dispatch` at once and
  `flush` once the transactions waiting for it are drawn; a disconnect restores both. A wrapper
  someone added over ours stays, and ours passes through.
- `logChanged(id, end)` is pushed once per task (a microtask), for attached editors, when rows are
  appended, timed or cleared. `LogSlice.pending` is the first row that may still change: the panel
  keeps the rows before it and refetches from there.
- Panel: a Log tab (`packages/panel/src/Log.tsx`, `log-source.ts`): Record/Pause, Clear, a count
  with the rows over 16 ms; a timeline strip (one bar per entry, square-root height, the dashed
  line a frame's budget, click to select); virtualized rows with a sticky header (index, time,
  userEvent, doc/sel/app, effects, annotations, dispatch and flush ms, `*` for a flush DevTools
  forced; slow rows tinted); the list follows new rows while scrolled to the bottom; arrows,
  Page Up/Down, Home and End move the selection. The entry pane shows the detail (ranges as
  struck-out/added text, tokens and ChangeSet JSON folded). Loads only while the tab is shown, as
  the Structure.

### Deviations

- **Push renamed** `logAppended(id, count)` → `logChanged(id, end)`: it also fires when rows get
  their flush timing or are cleared.
- **Recording needs a panel showing the editor** (not planned): `record(on)` on an editor no
  panel has selected fails, and an editor that stops being shown (switching editors, collapsing
  the dock, closing the extension's panel) pauses; its log stays. This keeps "nothing is recorded
  unless the panel is recording" when a panel goes away while recording.
- **Annotations** are read from Wordgard's internal `Transaction.annotations` (the public API only
  reads one annotation type at a time), narrowed with `"annotations" in tr`; without it the count is
  0 and the list empty. The count leaves out the automatic `time`.
- **Ring size** is set per `record` request, not in the plugin options (the registry's contract
  stays as it is); the panel doesn't offer it.
- The Vitest config pre-bundles `wordgard/state` too: found mid-run, Vite gave `log.ts` a second
  Wordgard copy, whose `Transaction.time` didn't match the editor's.

### Audit (Fable)

Accepted and fixed:

1. In the dock, an editor reconnecting as the same instance (same id) kept a stale Log claiming to
   record. The Log now reloads on any change to the editor list, and restarts when the page's log
   is shorter than its own. Tested.
2. Pausing (or a deselect) before the frame's flush dropped that flush's timing. `flush` now stays
   wrapped until those transactions are drawn. Tested.
3. `timedDispatch` dropped `this` for a wrapper the app had installed as a method: called with
   `dispatch.call(wg, tr)`.
4. The dedupe set was global: a transaction dispatched to two editors sharing a state was logged
   only in the first. Per editor now. Tested.
5. A failed entry detail stayed cached with no way out: the pane shows Retry.
6. `aria-activedescendant` pointed at a row the virtualizer had dropped: set only while the row is
   rendered.
7. The plan wasn't updated (this section).

Kept as limitations:

- A flush forced inside a dispatch before the devtools listener ran (a listener ordered before
  ours reading layout) draws a transaction not yet recorded: it is credited to the next flush. A
  comment says so.
- The detail cache can evict (past 32 entries viewed) a promise the pane still shows; the next
  render then shows "Loading…" briefly. Not worth more code.

### Open points

- The timeline is per entry, not on a time axis.
- ~~The timer rewrite after the audit wasn't re-audited~~: the 5b/5c audit covered it and found
  nothing.

## Implementation notes: phases 5b and 5c (2026-11-04)

Checks at the end: `npm run typecheck`; `npm test` (devtools 59, panel 52, extension 12, two
consecutive clean runs); `npm run build`; e2e 11 tests (a Schema step; a Fields step that types in
the demo's editor and sees its named `wordCount` field change). One Fable audit covered both
phases and phase 5's reworked timer.

### 5b: how it works

- `schema(id)` (`packages/devtools/src/schema.ts`, lazy): per node type its kind, inline or block,
  groups, roles, the spec's content query, the types it holds (`schema.canContain`), the marks
  allowed on it (`schema.markAllowed`), its param (`defaultParam`, `validate`), flags (doc,
  textblock, isolating, defining, neutral, preserveWhitespace, canBeEmpty, row, selectable) and a
  short shape (`<p>`, a structure's HTML, `[attribute]`); per mark type its spec target, the node
  types it goes on, rank, flags (inclusive, spanning, element, keepOnSplit, keepOnTypeChange),
  param and shape. Plus the document type and the line break.
- The `stateChanged` push gained `reconfigured`; the store's `onConfigChanged` reloads the tab
  (when shown, as the Structure).
- Panel: a Schema tab (`Schema.tsx`): a card per type, coloured like the Structure's; type names
  link to their cards; a filter by name.

### 5b: deviations

- **Groups have no names in Wordgard** (only identity). Its own are named (`Textblock`,
  `Content`, `TableCell`, `ListItem`; `All`, `Inline`, `Block`, `Leaf`, `Plot` are left out, the
  kind says them); others are numbered `group #n` in the order the specs mention them. A group
  only a `Schema.Override` mentions isn't seen.
- **Content and targets are the spec's wording**, marked "(spec)": an override may change them.
  `holds`, `goes on` and the groups come from the schema, so they are what applies.

### 5c: how it works

- `wordgardDevtools({fields: {name: field}})` names fields. `register(wg, name, fields)` merges the
  names into the entry (`Entry.fields`, optional: an older copy's registry ignores them) and
  notifies, so the panel reloads.
- `packages/devtools/src/fields.ts` (lazy): fields are found by walking `state.config.base`
  (arrays, Wordgard's precedence and compartment wrappers, a compartment's current content through
  `Compartment.get`, objects with an `extension`), cached per configuration; unnamed ones are
  `field #n` in that order. While tracked, the agent's `updated` compares each field's value per
  transaction of the update (`!==`), keeping the last 50 changes per field, each with its
  transaction, linked to its log index when the log holds it.
- Tracked while the log records, or while a panel shows the Fields tab (`watchFields(id, on)`,
  per client: the dock and the extension each have their own; it stops when that client no
  longer shows the editor).
- `fields(id)`: name, preview, changes seen, last change (time, log index). `field(id, index)`:
  the value through `toSafe` and the history. `toSafe` now walks an object's own properties when
  its `toJSON()` throws (Wordgard's history field needs a state).
- Panel: a Fields tab (`Fields.tsx`): the list, a pane with the value and the history (newest
  first); a change's `#n` opens the Log tab with that entry selected (`store.showLogEntry`).
  Reloads on every state change while shown.
- The demo names a `wordCount` field on its plain editor.

### 5c: deviations

- **Changes are found per update** (the update listener every package copy already delivers to
  attached editors), not by a new transaction listener flag, which older copies wouldn't know.
  So changes appear after the editor's flush.
- **Discovery limits**: a field only a facet or another field provides (`Field.provides`, a facet's
  `enables`) isn't found. Nothing in Wordgard itself does that today.

### Audit (Fable)

Accepted and fixed:

1. A same-instance reconnect (same id) left the Fields tab saying "Tracking" while the page had
   dropped its tracking: it now reloads and watches again when the editor list changes, as the Log
   does. Tested.
2. One watching flag per editor for two panels: one hiding its tab stopped tracking for the other.
   Per client now. Tested.
3. Field names added to an editor already registered didn't notify the panel: they do now.
4. A custom group first named in a later type's content query was missing from earlier types'
   groups: every spec's groups and queries are named before the types are listed. Content and
   targets are marked as the spec's wording. Tested.
5. Plan not updated: this section.

Rejected:

- History kept after tracking stops (each change holds a `Transaction`): bounded (50 per field)
  and dropped with the editor; keeping it means the tab shows the history again when reopened.

Nothing found in phase 5's reworked timer.

### Also done at the user's request (2026-11-04)

- The Tree tab outlines a node in the page when its row is clicked, not hovered (phase 4 had
  hover). The outline stays until another row is clicked, the tab changes or the editor does. The
  Structure tab still outlines on hover.
- The toolbar's dock-side and theme buttons, which cycled, are dropdown menus (shadcn's Dropdown Menu
  on Base UI's Menu, radio items): `ChoiceMenu` in `Panel.tsx`.
- Tree rows and Structure boxes have a context menu (right-click, Shift+F10 or the ContextMenu
  key): scroll into view in the page, show in the other tab (`store.showNode`), copy JSON, copy
  path. As in Stesura's editor (`editor-react/src/floating-menus/context-menu`), one menu per view
  opens through a hidden trigger, so no menu root or trigger wraps the rows; the row it opens on
  takes focus, and gets it back when the menu closes. `node-menu.tsx`.
- Flags, marks and tags use shadcn's Badge (a compact `Tag`). The Base UI components come from the
  scratch project, converted to arrow functions, their popups portalled into the panel's root.
- The side pane (node, transaction, field) is resizable (shadcn's Resizable, react-resizable-panels 4) and can't collapse: `split-pane.tsx`, side by side from 672 px wide, stacked below. Its size is
  kept per orientation, for every tab and editor (`localStorage` `wordgard-devtools:pane`). The
  virtualized lists now hold their scroll element in state, and the tree rebuilds when it
  subscribes: the split pane mounts the list a render late.
- The Structure tab outlines on click too (not hover). Its boxes holding blocks collapse (chevron;
  ArrowRight opens, ArrowLeft closes; a reveal opens the boxes on the way).
- The page outline sits one z-index below the in-page dock, so it passes under the panel.
- The selection strip is labelled "Selection" and wraps when narrow.
- Schema tab: "n nodes" and "m marks" are toggles showing one kind only; each section filters by
  tag (a type shows with every pressed tag: plot, block, textblock, defining, canBeEmpty, …;
  inclusive, spanning, element, …); marks order by schema or by rank. The document and line break
  names are gone from the header.
- The row context menu gained "Show <type> type in Schema" (`store.showType`) and "Log to the
  page's console" (new `logNode` request: the agent logs the node object).
- The title reads "Wordgard DevTools"; docked left or right, it sits on its own tinted row. Tabs
  wrap instead of being cut off.
- `title` attributes became shadcn tooltips (`tip.tsx`); the timeline shows the hovered bar's times
  in a corner instead of a tooltip per bar.
- The dock's collapse button is a Close button (it still leaves the reopen button). A Pause button
  (`store.pause`) stops the panel as closing does: no pushes, no editor attached, so the plugins'
  listeners only check their flags; an overlay with a play button resumes.
- Colours (`colours.ts`): node and mark types take a hue from a palette of 12 distinct colours,
  the one their name hashes to, or the next free one when another type has it (kept for the
  session; shared by hash once all are taken). Marks are tinted badges; text chips have a slate
  right edge.
- Structure boxes use `content-visibility: auto` (the browser skips laying out and painting boxes
  off-screen) instead of virtualization, which would have meant flattening the nested boxes into
  rows. React still renders every node: fine for the developers' documents in scope.

### Tree replaced by State (2026-11-04, at the user's request)

The Tree and the Structure showed the same thing. The Tree tab is gone; a **State** tab shows the
editor's state as plain JSON, and the Structure is the one view of the document.

- `stateJSON(id)` (`serialise.ts`): `GardState.toJSON()`, plus each field named by
  `wordgardDevtools({fields})` whose spec has a `toJSON` (Wordgard's `toJSON(fields)` throws for the
  others; they're left out). The `children` request, `doc-source.ts`, `DocTree.tsx` and headless-tree
  are gone.
- `State.tsx`: a virtualized JSON viewer (TanStack Virtual, one line per value, opening or closing
  bracket), collapsible per object and array, expand all / collapse all, copy, tree keyboard
  (arrows, Home, End; Left closes or goes to the parent). Reloads on every state change while shown.
- The Structure is the first tab and the default. A pick switches to it. The context menu's
  "Show in Tree / Structure" is gone.
- Structure: expand all / collapse all (the document stays open); the selection's start and end are
  marked in the innermost node holding each (their own icons; a cursor has one), with "Start of
  selection - pos X" / "End of selection - pos Y" / "Cursor - pos X" tooltips; Reveal has a
  tooltip.
- Schema: the card a link or a click lands on is ringed ("show type in Schema" included); more space
  between the node and mark sections.
- The pause icon is two solid bars.

Fixes from the audit of the previous batch:

- The split pane ignored no measurement: a hidden tab measures 0 wide, which flipped it to stacked
  and remounted its content on every tab switch (reloading it). Zero sizes are ignored now; a test
  runs at 1200 px wide.
- While paused, the editor picker and the Pick button still reached the page: the picker is
  disabled, Pick hidden, `select` and `pick(true)` ignored, and the content under the overlay is
  `inert`.
- Four tooltips per Log row: per-row tooltips dropped, the column headers keep theirs; the Fields
  list's tooltip only where there are changes.
- The Tree didn't scroll when wide: gone with the Tree.
- A stale comment in `inspect.ts`.

Audit of this pass (Fable). Accepted and fixed:

1. Resuming after a pause left the Structure, State and Schema showing what they had before (the
   agent drops updates while nothing is attached): resuming now reloads every tab once the editor
   is attached again. Tested.
2. State: closing an object (or Collapse all) that held the focused line lost the focus: it moves
   to the closed object (the root's entry holding it, for Collapse all). Tested.
3. State: line ids collided for keys containing "/" (or empty keys vs closing lines): keys are
   URI-encoded in ids, closing lines end in `#`. Tested.
4. A node selection marked the block around it, not the node: `SelectionInfo.nodePath` is the
   selected node's path, marked with its own icon ("Selected node - pos X–Y"). Tested.
5. State: ArrowRight on an open object now goes to its first entry (the ARIA tree pattern).
6. Leftover Tree wording in two tests; the Structure test's "Collapse all" lookup is scoped to its
   tab (the State has a button of that name too).

Kept: colours depend on which type claims a hue first, so after a reload a colliding pair (e.g.
Paragraph and BulletList hash to the same hue) can swap. Consistent within a session, which is what
was asked; a fixed assignment would need every type known up front.

### View tab, contrast and polish (2026-11-04, at the user's request)

- **View tab** (`View.tsx`, `view-source.ts`; page side `view.ts`): the editor's status (connected,
  editable, focusable, focused, composing, Wordgard or a subclass, document or shadow root, theme
  classes, where the head is drawn) and its content's DOM as a virtualized, collapsible tree. Each
  element shows the node it draws (`nodeFromDOM` + `nodeDOM`, in the type's colour, with its
  positions); text shows its position (`posAtDOM`); uneditable elements drawing no node are flagged
  "chrome" (widgets, decorations, React chrome). A click outlines the element in the page (the
  inspector outlines any DOM node now); a button logs it to the page's console. Requests `view` and
  `viewElement` (outline or log, by child indices). Not shown: plugins and decoration sets (Wordgard
  internals).
- **Contrast**: `--muted-foreground` is darker in light (0.50, 5:1 or more on background, muted and
  accent) and lighter in dark (0.76, 4.8:1 or more); type and mark colours darker in light (5.2:1 or
  more on muted).
- **Tabs and bars**: the header and the tab bar are grey; tabs are filled, the active one on the
  content's background; each tab's own toolbar is lightly tinted.
- **Schema**: an × clears the node/mark toggle, and one per section clears its tag filters.
- **Fields**: a status badge ("Tracking changes") with the explanation in a tooltip; a header row
  aligned with the columns; each field in its own box, its name in a badge.
- **Reopen button**: black with white text in both themes (15:1 or more, hovered too; the old dark
  hover was wrong), with a lighter border and a faint ring on dark pages (orange first, back to
  black at the user's request); a cog
  menu in the dock's toolbar puts it in any corner, or minimizes it to a cog. Saved with the dock
  layout. The dock and theme menus close on a pick.
- **Pick mode's cursor**: the panel's pick icon (Heroicons cursor-arrow-rays, as an SVG cursor; crosshair as the fallback) over the editors' content while picking (a stylesheet adopted by
  the document and by the shadow roots holding editors, removed when picking ends); the rest of the
  page and the panel keep theirs.

### CI (2026-11-04)

- The first GitHub run (the push of phase 4) failed at Install: `npm ci` ran the `prepare` script
  of the `file:` link to `../wordgard`, and the npm tarball ships `dist/` built but not
  `bin/build.ts`. Locally npm 12 blocks install scripts, so it never showed. The sibling step now
  deletes `scripts.prepare` from the unpacked tarballs. The workflow can also be started by hand
  (`workflow_dispatch`).
- The workflow's steps then passed on a copy of the working tree, with the siblings from their
  tarballs and npm 11 as on GitHub: `npm ci`, typecheck, tests (devtools 64, panel 69, extension 12),
  build, e2e 11. Not run: Ubuntu, `playwright install --with-deps`. The next push runs it on GitHub.

Audit of this batch (Fable), all accepted and fixed:

1. In a read-only editor every element was "chrome": Wordgard marks the content element itself
   `contenteditable="false"`. It no longer counts. Tested.
2. The reopen button's tooltip never showed: it renders outside the panel, with no portal root. It
   has its own now. Tested.
3. Dark State booleans (violet-400 on the focused row, 3.6:1): violet-300.
4. Dark search matches in the Structure drowned their text in yellow: a ring marks them, over a
   faint tint.
5. Slow Log timings (`text-destructive` on the slow rows' tint, 4.4:1): red-700 / red-300.
6. An outlined View element that left the DOM left a 0×0 box at the viewport's corner: the
   outline goes when its element does.
7. A click on a View element that changed since the last load did nothing: the View reloads.
8. "Wordgard or a subclass" compared classes, false with two copies of Wordgard: it checks the
   prototype chain (Wordgard extends nothing).
9. The State and View roots showed as selected before any interaction: nothing is until a line
   is picked.

### Open points

- Field indices can shift on a reconfigure that adds or removes a field: the selected field may
  then show another one. Not tested.
- The Fields tab doesn't say which fields it can't find (see the discovery limits).
- `record` is still one flag per editor for both panels (phase 5's design): one panel pausing
  pauses the other.

## Production builds (2026-11-05)

Added at the user's request.

- `isProduction()` (`production.ts`, exported): `process.env.NODE_ENV === "production"` in a
  `try`. Bundlers replace the expression in dependencies (Vite in dev and build, webpack, Next);
  without a bundler `process` throws and it reads as development. No `typeof process` guard: webpack
  replaces the expression but leaves `process` undefined, so the guard would hide production.
- One option, `enabled` (first `showInProduction`, renamed so it also turns the devtools off where
  `NODE_ENV` isn't set: no bundler, Rollup without the replace plugin). It defaults to
  `!isProduction()`.
- `wordgardDevtools({enabled})`: when off, it returns `[]`. Its
  return type is now `GardState.Extension` rather than the `Wordgard.Plugin`.
- `mountDevtools({enabled})`: when off, it returns a detached
  host, a resolved `ready` and a no-op `unmount`; the panel's chunk is never imported.
- The demo passes `enabled: true` everywhere: it is deployed, and the e2e runs against its
  production build. Checked that the demo's build folds `isProduction` to `true`.
- Not done: export conditions with no-op builds. They'd save the page side's few KB but can't honour
  the option; the README shows the `import.meta.env.DEV` guard for zero bytes.

## Packaging and publishing (2026-11-06)

Phase 9, npm side. Done at the user's request; the extension stores are parked.

### What a user installs

- `@stesura/wordgard-dev-tools` (about 25 kB packed): no dependencies, `wordgard` as a peer.
- `@stesura/wordgard-dev-tools-panel` (about 256 kB packed, 1 MB unpacked): no dependencies of
  its own, `@stesura/wordgard-dev-tools` as a peer at the exact same version. React, Base UI and
  the other UI libraries are compiled into one lazy chunk (about 0.9 MB, not minified: the app's
  bundler minifies). They are devDependencies, so no `react` lands in the app's `node_modules`.
- Both ship `LICENSE`, a short `README.md` and a `repository` field; the panel also ships
  `dist/THIRD_PARTY_LICENSES.txt`. publint is clean on both.

### Panel build

- `process.env.NODE_ENV` is defined as `"production"` in the build only (`command == "build"`):
  production React only, and the chunk no longer depends on the app's bundler to pick a React
  build. Tests and the extension build from source and keep development React.
- `@stesura/wordgard-dev-tools` is external. The old external pattern (`wordgard-devtools`) had
  gone stale with the rename, so the panel bundled its own copy of the page side. That copy's
  `isProduction()` would have been folded to `true` by the define, and `mountDevtools()` would
  never have mounted. Now the panel imports the page's copy, and the page's bundler decides.
- `./ui` is internal: exported only under the `source` condition and not built. Its `<Panel>`
  bundles React, so a host's own React couldn't render it (two Reacts, invalid hook calls). The
  extension, its one user, builds from source.

### Releases

- Lockstep: both packages are always released together at one version. `npm run
release:version -- X.Y.Z` (`scripts/version.ts`) sets it in both packages, in every workspace
  that refers to them, in the agent's `VERSION` and in the lockfile, editing text to keep each
  file's formatting. `npm run release:check` fails on drift; CI runs it.
- `prepack` builds each package, so a publish from a clean checkout can't ship an empty `dist/`.
- `.github/workflows/release.yml`: on a `v*` tag it runs CI (`ci.yml` is now callable), checks
  that the versions match the tag, then publishes the page side, then the panel, with
  provenance. A prerelease tag publishes to the `next` dist-tag (npm 11 requires one).
- `.github/actions/setup`: Node, the sibling `wordgard` and `react-wordgard` folders from npm,
  and the install, shared by CI, Release and the latest-Wordgard run.
- Steps are in `CONTRIBUTING.md` ("Releasing").

### Wordgard versions

- The page side's peer is `wordgard >=0.6.2 <1` (was `~0.6.2`). npm enforces peer ranges, so the
  narrow range would have blocked every app's Wordgard upgrade until a devtools release.
- Fail safe: the first error from the devtools' code in the app's editor (most likely a Wordgard
  API they don't support) turns them off for the page with one console warning, and
  `wordgardDevtools()` returns `[]` from then on. This covers building the plugin, its listeners
  and registration. It matters even without version changes: Wordgard catches errors from update
  listeners and plugins, but not from transaction listeners, so an agent error while recording
  reached the app's `dispatch`. The shared listeners are built on first use, not on import.
  Tested (`fail-safe.test.ts`, `fail-safe-api.test.ts`); both fail against the old plugin.
- CI tests the floor (the setup action's `wordgard` default, 0.6.2). `release:check` fails unless
  it equals the peer range's floor, so a newer API used without raising the floor fails CI. A local
  `../wordgard` can be newer than the floor.
- `.github/workflows/wordgard-latest.yml` runs daily against the newest `wordgard@<1`: typecheck
  and tests of the page side and the panel. It installs without the lockfile and with
  `--legacy-peer-deps`, since react-wordgard may not accept that Wordgard yet. Not run yet.
- The panel has no `wordgard` peer: it only uses Wordgard types, none of which reach its `.d.ts`.

### Deviations

- No Fable audit: the work was done in small steps at the user's request, each checked
  (typecheck, 155 unit tests, build, 11 e2e).
- None of the workflows (CI with the shared action, Release, Latest Wordgard) has run on GitHub
  yet.

### Parked: extension stores

Parked by the user (2026-11-06). To do before the first store release:

- **Protocol compatibility.** The extension updates itself; apps stay on the page side they
  installed. Today the extension accepts exactly `PROTOCOL` (`frames-transport.ts`), so the first
  protocol change breaks every app on an older page side, with no rollback. Before releasing:
  - additive changes don't bump `PROTOCOL`; the agent's `announce` lists what it supports, and
    the panel greys out what an older agent lacks;
  - the extension accepts a range of protocols, with an adapter for the previous one for a
    published period;
  - the `announce` envelope (`source`, `v`, `agent: {version, protocol}`) is frozen;
  - the mismatch message says which side to update and how, and points to `mountDevtools()`,
    which always matches;
  - e2e against the previous release's agent (an npm alias).
- **Store checklist.** Real icons (WXT defaults now); a manifest version (`0.0.0` now); a written
  reason for each permission (`<all_urls>` with `scripting` means in-depth review on the Chrome
  Web Store); privacy declarations and a short privacy policy; the final Firefox add-on ID (it
  can't change once listed); `strict_min_version` 140 for `data_collection_permissions`; listing
  assets.
- **Firefox source review.** AMO needs the source of bundled code and steps that rebuild it. The
  `file:` dependencies on `../wordgard` and `../react-wordgard` must become registry versions first.
- No need to wait for Wordgard v1: the extension only speaks the protocol. What matters is that
  the protocol is stable and the compatibility rules above are in place.

### Open points addressed (2026-11-06)

- **Missing named exports.** The page side imports Wordgard values through namespaces only
  (`import * as wordgardState from "wordgard/state"`; named imports stay for types). A value the
  app's Wordgard lacks is then `undefined`, and the guards handle what follows. Checked with
  Vite's bundler: a missing namespace member builds with an `IMPORT_IS_UNDEFINED` warning, a
  missing named import fails the build. Only `plugin.ts` loads with the page; the other modules
  load lazily, and a failure there becomes an error reply. `imports.test.ts` fails on any named
  value import from `wordgard`.
- **Timing wrappers.** The Log's `dispatch` and `flush` wrappers pass every argument and the
  result through, and their bookkeeping can't throw into the app: an error there restores the
  originals, with one warning. The originals' own errors still propagate. Tested in
  `log.test.ts`; the test fails against the old wrappers (`Error: boom` thrown out of the app's
  `flush`).
- **`npm ls` crash.** Not the `file:` siblings: four junctions in `node_modules` (`demo`,
  `wordgard-devtools-extension`, `wordgard`, `@stesura/react-wordgard`) pointed at `c:\…` with a
  lowercase drive letter, from an install run where the working directory was spelled that way,
  and npm lost their targets. Removed and reinstalled; `npm ls` works. If it comes back: `rmdir`
  the lowercase junctions and run `npm install` from a `C:\` directory.

### Open points

- Publishing: the first release can go out by hand after `npm login` (no token, no provenance),
  then trusted publishing on npmjs.com for both packages, so the Release workflow needs no
  `NPM_TOKEN`. Pinned by the user (2026-11-06); the workflow comment and CONTRIBUTING still
  mention the token.
- When Wordgard v1 is released, the page side needs a release that accepts it (the README says
  so).

## Panel polish (2026-11-06, at the user's request)

**Executed.**

- **Icons**: lucide-react is gone. Heroicons' 16px solid set is copied into `packages/panel/src/icons`
  (`heroicons.tsx`, generated from the `heroicons` devDependency, which is kept for the licence), with
  icons drawn in its style where it has none (`custom.tsx`: the dock sides, record, text cursor,
  selection start and end, node selection, collapse all). Buttons show icons at 16px, the set's size.
  Expand all is chevron-up-down; collapse all is its chevrons swapped to point in. The shadcn CLI has
  no Heroicons option: components added with it import lucide-react and need pointing at `#icons`.
- **Hover**: ghost and pressed buttons tint with the foreground (they used `bg-muted`, the toolbars'
  own colour, so showed nothing there).
- **Pick cursor**: see "Pick mode's cursor" above; the icon's path is copied into the page side
  (`pick-cursor.ts`, with the MIT notice), which can't import the panel's.
- **Tabs** (VS Code-like): square, full height, split by a line; the active one has the colour of the
  toolbar under it (`--color-strip`, muted at 40% over the background, opaque; every tab's toolbar
  uses it) and covers the bar's bottom border, so they join.
- **State**: a context menu (right-click, Shift+F10, ContextMenu key): "Highlight in the editor" for
  node objects only (`doc` and its `content` entries, down; outlines and scrolls to the node until a
  line is clicked, the document changes, or the tab or editor does) and "Show in Structure" for
  node objects only, "Log to console"
  (nodes through `logNode`; anything else through the new `logState` request: the live state,
  selection or named field where the keys name one, the JSON value otherwise), "Log as JSON"
  (`json: true` on either request: `node.toJSON()`, or the value from `stateJSON`), "Copy JSON",
  "Copy path" (`doc.content[0].param`). An opening or closing bracket selects its whole object or
  array; the focused line keeps a mark inside it. `createMenuAnchor` generalises the node menu's
  anchor; keyboard opening also follows `aria-activedescendant`.
- **State toolbar**: buttons to log the state, live (`logState` with no keys: the `GardState`) or as JSON (`stateJSON`), beside expand, collapse and copy.
- **Node menu** (Structure): "Log as JSON" too. A logged node is labelled with its range
  ("Paragraph at range 16–60"), not its path.
- **Fields**: a context menu on a field (selects it): "Log to console" (new `logField` request: the
  live value) and "Copy value"; the pane has a copy button by the value. No fields, no menu: the
  rows' first attribute, `data-index`, is also on Base UI's tab panels, so a right-click anywhere in
  the tab opened it; rows are `data-field-index` now, and every menu anchor takes only rows inside
  its own container. Tested.
- **Selection bar**: moved from the top of the Structure to the bottom of the panel, under every
  tab (`SelectionBar`, from the store's selection). An eye button (was "Reveal") shows the head's node in the Structure
  (`showNode`) from any tab; buttons log the live selection (`logState` on `selection`) and copy its
  JSON. Active marks (`state.sel.activeMarks`) follow head, as Schema-coloured links, with
  "(stored)" when they're the cursor's own (`GardSelection.Text.marks`, "none" when it stores an
  empty set); hidden when there are none. `SelectionInfo` carries `activeMarks` and `storedMarks`.
- **Structure's node pane**: "type" (was "name") and each mark are badges in their Schema colours
  (`TypeLink`), links to their card in the Schema (`showType` takes a kind now: node or mark). The
  JSON, under a divider, has buttons on the right to log it (`logNode` with `json`, even for a node
  too large to show) and copy it.
- **Selection tab** (after Structure; `Selection.tsx`, `selection-source.ts`): the selection
  (type, from–to, the selected node, the ranges when several, the marks typing would get), its
  anchor and head resolved (one "Cursor" when empty), and any position typed into a box, resolved;
  the selection's JSON with log and copy. A resolved position: parent, depth, index (and the offset
  into a text node), the nodes before and after (with the text either side, in a text node), the
  textblock, at the start or end of its parent, the marks there. Nodes link to the Structure, types
  to the Schema. Page side: `resolve` (`doc.resolve(pos)`, nodes as tree nodes) and
  `selectionDetail` (anchor, head, ranges, `state.sel.activeMarks`). Reloads on each state change
  while shown, the typed position too. The bar's "Selection" (a link) opens the tab; its fields read "type:", "anchor:", "head:".
  Wordgard takes a range's active marks from the nodes either side of it, so a selection covering
  all of a bold run gets none: shown as Wordgard computes it.
- Selection tab, second pass (at the user's request): each card names the expression it shows
  (`state.selection`, `state.sel.anchor`, `doc.resolve(5)`…) and positions read "Pos at n", with a
  line saying what a resolved position is; the selection's JSON sits beside it; every position has
  log (new `logPos`: the live `doc.resolve(pos)`) and copy buttons. A **Slice** card:
  `selection.toSlice(doc)` (what copying takes): length, text, its tokens (plots opening ⟨ and
  closing ⟩, nodes boxed with their text and marks; the first 200) and its context, with log (new
  `logSlice`) and copy. The position box has no spin buttons.
- Selection tab, third pass: the Selection and JSON cards have a fixed height (their content
  scrolls), so a selection whose JSON grows doesn't move the rest. "Resolved positions" is a bar of
  its own (sticky), saying what a `Pos` is and holding the position box; the anchor, head and typed
  position cards sit under it. A card's buttons (log, copy, clear) show while it's hovered or has
  keyboard focus, and always on screens without hover.
- **Fields pane**: value and history are two parts of a split inside it, laid out as the tab is:
  list | value | history across when the tab is wide, all three stacked when narrow, every part
  resizable. The tab's pane is wider by default than the others' (its own saved sizes);
  `SplitPane` takes a kind (storage key, width threshold, sizes) and a fixed orientation. Each
  field's history can be cleared (new `clearFieldHistory` request); the list's count goes too.
- **Log tab, recording dot**: while the log records, its tab shows a red dot (and "(recording)" for screen readers), seen from any tab. The Log tab, kept mounted, reports its source's `recording` to the store (`setRecording`), which the tab bar reads.
- **Header**: the editor picker, "n editors", Pick, Pause and the panel's buttons (theme, dock,
  close) are one group: on the title's line when it fits, else under the title, the buttons at its
  end, wrapping onto a third line at the narrowest.

Audit of the Selection tab and the changes since the last audit (Fable). Accepted and fixed:

1. A reload re-resolved the typed position shown, not the one asked for last: with a reply pending,
   the input said 5 and the card showed 3. The source keeps the position asked for. Not tested (the
   race needs a transport with delayed replies).
2. The text before a position in a long text node was cut at its start, losing what's next to the
   position: it's cut at the other end now. Tested.
3. A decimal position was "outside the document"; a huge one showed nothing: positions must be
   whole numbers (its own error), and anything typed goes to the page. Tested.
4. `atStart` / `atEnd` claimed more than they compute: the comment says what they are (the very
   start or end of the parent's content).
5. The "typing gets" label wrapped in its column: "typing".
6. `selectionType` was in two files: one now.

Rejected: the summary (from the store's selection) and the cards (from the tab's own request) can
disagree when only one request fails. The error banner says so, and Retry reloads.
- **Schema**: Nodes and Marks each have a sticky bar with the title, the count ("n", or "shown of
  all") and the tag filters; scrolling to a card allows for the bar.
- **Schema, Node groups** (a section after Marks, with its own toggle and filters):
  a card per group: its types, the node types whose content names it, the mark types whose target
  does. Groups have no names: Wordgard's own by theirs, a schema's numbered ("group #1"), as the
  node cards already showed them. Those every type is in or not by its kind (All, Inline, Block,
  Leaf, Plot) come last, tagged "automatic" (a tooltip says why node cards don't list them); Wordgard's groups this schema neither fills nor names
  are left out. A node card's groups link to their cards, a group card's types and marks to theirs.
  Page side: `SchemaInfo.groups`.
- **Schema, section guides**: a guide (?) in the Nodes, Marks and Node groups bars, after the count, as the tabs' guides: what the section lists and what each line of its cards means (`SCHEMA_NODES`, `SCHEMA_MARKS`, `SCHEMA_GROUPS` in `guides.ts`). Each tag (plot, leaf, block, inline, textblock, doc, defining, neutral, isolating, canBeEmpty, preserveWhitespace, row, selectable; inclusive, spanning, element, rank, keepOnSplit, keepOnTypeChange) is explained in the reference's own words and linked to its entry there (anchors checked on wordgard.net/docs/ref). Guide text takes markdown links (`[label](href)`), drawn with a dotted underline; the README renders them as written.
- **Schema, spec pane** (a split: on the right, at the bottom when narrow): the selected card's
  JSON. A node or mark type's spec as written (`spec`, sent with the schema: groups, roles and
  content/target queries by the names the cards use, a structure shape as its HTML, functions as
  `ƒ name(params)` from their source, nesting limited), with log (new `logType`: the live type) and
  copy; a group's card data. A **Spec | Effective** switch (types only; kept from card to card):
  the effective view is what applies, from Wordgard's public API (`EffectiveSpec`, sent with the
  schema): inline, groups, roles, what a plot holds, its flags with their defaults (canBeEmpty,
  isolating, defining, neutral, preserveWhitespace, orientation), selectable, the marks allowed; a
  mark's inclusive, spanning and targets. Each value that isn't the spec's has a comment: "default"
  (the spec doesn't set it), "override" (it differs from the spec's, highlighted), "from the
  schema" (worked out from the whole schema). Copy copies the values, without the comments. When
  an override changes what applies (only overrides: defaults don't contradict the spec), the
  "Effective" button is amber and a note under the header says so, naming what it changes, with a
  link to the effective view (there, it says the highlighted values are the override's). A guide (?) beside the switch, as the tabs' guides, explains spec and effective and the three notes, one for node types and one for mark types (its defaults, its targets); none for a group, which has no switch. Not
  available: overrides themselves and a mark's resolved rank (Wordgard internals), `defaultBlock`,
  `cursorBarrier` (resolved where they're used). Fixed with it: Textblock is one of the groups
  Wordgard assigns itself (to block plots with inline content), now "automatic" like All, Inline,
  Block, Leaf and Plot, and no longer listed on node cards. The pane closes (×); a double click on a card, or "Show JSON" in a card's
  context menu (there only while the pane is closed: opening the menu selects the card, which an
  open pane already shows), shows it again on that card. The menu also logs the type (live) or its JSON
  (`logType` with `json`; a group, its data) and copies the JSON. `SplitPane` takes a null pane:
  the content stays mounted, keeping its scroll.

Audit (Fable). Accepted and fixed:

1. A highlighted node's outline follows its path, so after an edit it could outline another node:
   a document change hides it. Tested.
2. The Marks bar's top border, stuck under the toolbar, doubled its line: the line above the bar is
   the nodes' list's now.
3. Inside a selected object the focused line looked like the rest: it has an inset bar.
4. A keyboard-focused tab's separator took the ring's colour.

Rejected: a named field called `selection` or `doc` replaces that key in the State's JSON, while the
menu logs the live selection or treats `doc` as the document. Not a realistic field name.
