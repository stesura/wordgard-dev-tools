# Panel restructure — plan

Status: PARTIALLY EXECUTED. Phases 0 to 7 done on 2026-11-06, see
[Implementation notes](#implementation-notes). Drafted 2026-11-06 from an audit of
`packages/panel`, scope agreed with the user the same day; revised after a Fable review the same
day, see [Review](#review-2026-11-06).

Scope: `packages/panel` only, plus what has to follow it (root lint and format config, the scripts
that import panel files, docs). The page side (`packages/devtools`) and its protocol don't change:
the `"view"` _request_ keeps its name, only the panel's tab is renamed.

## Why

`packages/panel/src` holds 37 files and about 9k lines, flat, except for shadcn and the icons. Seven
tab files make up about 4.6k lines (Schema 1038, Log 921, State 731). Two code styles are mixed
(Panel, Schema, Selection, State and node-menu have semicolons and spaced braces, the rest don't).
Files are named in two styles (`Log.tsx`, `node-menu.tsx`). The same boilerplate repeats in every tab.
The patterns underneath (external stores, request versioning, the menu anchor) are sound: this
plan moves and deduplicates code. It doesn't redesign it.

## Decisions (agreed with the user)

1. Shared components move to `src/components/`; shadcn stays alone in `src/components/ui/`.
2. One folder per tab under `src/tabs/`.
3. Guides become markdown files, all in one folder, `src/guides/`.
4. Use nanostores for the stores.
5. No `types/` folder: types stay with their module.
6. Deduplicate what's sensible. **Any change that makes the code noticeably harder to read is
   dropped**, even if it removes lines.
7. shadcn: `toggle` / `toggle-group`, `checkbox` and `collapsible`, yes. No shadcn `input` and no
   `input-group` (their styling would have to be stripped). `alert`, no. Icons: heroicons
   (`#icons`), never lucide.
8. Split the large files.
9. No separate `src/ui/`: `components/ui/` is it.
10. Prettier. Arrow functions everywhere (lint-enforced). Kebab-case file names everywhere. The tab
    `"view"` becomes `"dom"`, and the `View` type (a tab) becomes `Tab`. Delete local junk.

## Preconditions

- The working tree is clean: the current uncommitted changes (Dock, Fields, Log, Schema, State,
  Structure, View, node-menu, node-pane, search, vite.config, CI, eslint and dependency-cruiser
  config, scripts) are committed by the user first. Formatting and moving files on top of them
  would mix the two.
- Every phase ends with all checks green: `npm run typecheck`, `npm test`, `npm run build`,
  `npm run lint`, `npm run dependency-check`, `npm run readme:check`, and, from phase 1 on,
  `npm run format:check`, and `npm run compiler:check` after the build.
  `npm run e2e -w wordgard-devtools-extension` runs at the end of phases 2, 4, 5 and 7.
- One phase per commit: the agent stops after each phase and the user commits (agents never run `git commit` or
  `git stash`). Phases 1 and 2 in particular must each be a commit of their own, so `git log
--follow` and blame survive.

## Target layout

```
packages/panel/src/
  index.ts ui.ts transport.ts mount.ts app.tsx styles.css styles-entry.ts
                         entries: package.json "exports" and mountDevtools' import() point here, unchanged
  panel/                 the shell around the tabs
    panel.tsx            Panel: header, notices, body
    panel-body.tsx       the Tabs element, driven by the tab registry
    editor-picker.tsx
    panel-controls.tsx   PickButton, PauseButton, PausedOverlay, Notices
    settings-menu.tsx    SettingsMenu, ThemeMenu
    dock.tsx             Dock
    dock-layout.ts       readLayout/saveLayout (later a persistent store), clamp, placement tables
  stores/
    panel-store.ts       createPanelStore (was store.ts)
    theme.ts
    persistent.ts        the persistent-atom helper (phase 5; replaces stored.ts and the ad-hoc localStorage)
    resource.ts          createResource (phase 6)
  tabs/
    tabs.ts              TABS: id, label, in order. Plain data: scripts import it under Node
    registry.tsx         TABS plus each tab's component and guide, for panel-body.tsx
    structure/  structure.tsx, boxes.tsx, structure-source.ts
    selection/  selection.tsx, selection-cards.tsx, selection-bar.tsx, selection-source.ts
    state/      state.tsx, json-lines.ts, state-row.tsx, state-menu.tsx, state-file.ts, state-source.ts
    dom/        dom.tsx, dom-lines.ts, dom-row.tsx, dom-menu.tsx, dom-status.tsx, dom-source.ts
    schema/     schema.tsx, schema-cards.tsx, schema-heading.tsx, spec-pane.tsx,
                schema-menu.tsx, schema-filters.ts, schema-source.ts
    fields/     fields.tsx, field-view.tsx, field-history.tsx, field-menu.tsx, fields-source.ts
    log/        log.tsx, log-rows.tsx, log-timeline.tsx, log-filters.tsx, entry-pane.tsx,
                row-menu.tsx, log-format.ts, log-source.ts
    (tests: test/<tab>.test.ts stays flat; view.test.ts → dom.test.ts)
  components/            shared app components (React)
    icon-button.tsx  choice-menu.tsx  tip.tsx  copy-button.tsx  copy-selection.tsx
    type-link.tsx  clear-filters.tsx  guide-popover.tsx  search-box.tsx  split-pane.tsx
    node-pane.tsx  node-menu.tsx  load-error.tsx  toolbar.tsx  expand-collapse.tsx
    inspect-section.tsx  portal.tsx
  components/ui/         shadcn only, generated, then icons rewritten to #icons
  lib/                   no React
    colours.ts  clipboard.ts  selected-text.ts  menu-anchor.ts  paths.ts  json.ts  time.ts (clock)
    dom.ts (scrollInto, centreRow)  text.ts (includes)  sets.ts (toggled)  promise-cache.ts  detail-cache.ts
  hooks/                 React hooks shared by tabs, no components: use-rows.ts (useRows)
  icons/
  guides/                *.md, plus parse.ts (pure) and guides.ts (loads them, Vite only)
```

The exact split of each tab follows the code; the names above are the intent. A file stays whole
when splitting it would scatter one idea across files.

Import rules, enforced by dependency-cruiser (phase 4):

- `lib/` imports nothing from `components/`, `tabs/`, `panel/` or `stores/`, and no React.
- `stores/` doesn't import `components/`, `tabs/` or `panel/`.
- `components/` and `hooks/` don't import `tabs/` or `panel/`.
- A tab doesn't import another tab. Today Schema takes `scrollInto` from Structure and Fields takes
  `clock` from Log; both move to `lib/` in phase 3 (`lib/dom.ts`, `lib/time.ts`).
- `tabs/tabs.ts` imports nothing (Node scripts load it).
- Type-only imports are exempt (`to: {dependencyTypesNot: ["type-only"]}` on each rule):
  `lib/colours.ts` takes `type CSSProperties` from React, and that's fine. Runtime imports are what
  the layers are about. Where a component only needed a tab's _type_, prefer passing the value in:
  `GuideButton` takes the `Guide` from the registry instead of a tab id.

Import aliases: `#components/*` stays as it is (`./src/components/*.tsx`: shadcn's
`components.json` writes `#components/ui/x`, with no extension). Add `#lib/*` → `./src/lib/*`,
`#stores/*` → `./src/stores/*` and `#hooks/*` → `./src/hooks/*`, used with the extension, as
relative imports are, in `package.json`
`imports` and `tsconfig.json` `paths` both. Within a folder, and from a tab to its own files,
imports stay relative.

## Phase 0: junk (executed 2026-11-06)

- Delete `packages/panel/.vitest/` and `packages/devtools/.vitest/` (ignored, but full of failure
  screenshots of tests that no longer exist: `tree`, `zz-probe`, `zz-tmp-layout`, `*.scratch`,
  `flip`, `shot`, `fields-empty`).
- Delete any other `__screenshots__` / `.vitest` directories in the repo.
- `scripts/bench-tmp.ts`, listed as untracked in the audit, is already gone; check that nothing
  else untracked is a leftover (`git status --short --untracked-files=all`) and ask before
  deleting anything that isn't obviously scratch.

## Phase 1: Prettier and arrow functions (executed 2026-11-06)

- Add `prettier` (root devDependency), `.prettierrc.json` and `.prettierignore` (`dist`, `.output`,
  `.wxt`, `node_modules`, `package-lock.json`, `docs/screenshots`). Everything else is formatted,
  `components/ui/*` and `styles.css` included: phase 7 ends with `npm run format`, since
  `shadcn add` writes its own style.
- Style: `../react-wordgard`'s, chosen by the user: `{"endOfLine": "lf", "semi": true,
"singleQuote": false, "tabWidth": 2, "trailingComma": "es5", "printWidth": 100}` (bracket
  spacing and arrow parentheses at Prettier's defaults). Nearly every file is reformatted.
- Scripts: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. CI steps
  "Format" and "Dependency rules" (`npm run dependency-check`, which CI doesn't run today) after
  "Lockstep versions".
- Format the whole repo once (the config is root-level, and a half-formatted repo fails
  `format:check`). This is the whole of the commit apart from the config: no other change.
- `.gitattributes` with `* text=auto eol=lf`, in the same commit. The index already holds LF for
  every text file (`git ls-files --eol`: 164 `i/lf`, 22 binary), so nothing is renormalised in
  history; with `core.autocrlf=true`, the working copy has about 30 CRLF or mixed files, which
  would fail `format:check` against `endOfLine: lf`. After adding it, re-check out the working
  copy (`git add --renormalize .` shows nothing to commit; `git checkout -- .` only on a clean
  tree).
- ESLint: a block for every TS file in the repo (not only the React ones) with
  `"no-restricted-syntax": ["error", "FunctionDeclaration",
"FunctionExpression:not(MethodDefinition > FunctionExpression):not(Property[method=true] > FunctionExpression)"]`
  and `"prefer-arrow-callback": "error"`. Methods stay allowed: class methods, and object method
  shorthand, which `scripts/third-party-licenses.ts:94` (`generateBundle(_, bundle) {…}`) needs
  for Rollup's `this.emitFile`. There are no `function`s in the repo today; the rule keeps it that
  way.
- `eslint-config-prettier` isn't needed: no stylistic ESLint rules are enabled.

## Phase 2: move and rename (no code changes) (executed 2026-11-06)

Only `git mv` and the import specifiers that the moves break. No splits, no edits to logic, so
git records renames and the diff is reviewable.

| Now                                                                                                                    | After                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `Panel.tsx`                                                                                                            | `panel/panel.tsx`                                       |
| `Dock.tsx`                                                                                                             | `panel/dock.tsx`                                        |
| `store.ts`                                                                                                             | `stores/panel-store.ts`                                 |
| `theme.ts`, `stored.ts`                                                                                                | `stores/`                                               |
| `Structure.tsx`, `structure-source.ts`                                                                                 | `tabs/structure/structure.tsx`, `…/structure-source.ts` |
| `Selection.tsx`, `selection-source.ts`                                                                                 | `tabs/selection/selection.tsx`, `…/selection-source.ts` |
| `State.tsx`, `state-source.ts`                                                                                         | `tabs/state/state.tsx`, `…/state-source.ts`             |
| `View.tsx`, `view-source.ts`                                                                                           | `tabs/dom/dom.tsx`, `tabs/dom/dom-source.ts`            |
| `Schema.tsx`, `schema-source.ts`                                                                                       | `tabs/schema/schema.tsx`, `…/schema-source.ts`          |
| `Fields.tsx`, `fields-source.ts`                                                                                       | `tabs/fields/fields.tsx`, `…/fields-source.ts`          |
| `Log.tsx`, `log-source.ts`                                                                                             | `tabs/log/log.tsx`, `…/log-source.ts`                   |
| `tip.tsx`, `copy-button.tsx`, `type-link.tsx`, `clear-filters.tsx`, `split-pane.tsx`, `node-pane.tsx`, `node-menu.tsx` | `components/`                                           |
| `guide.tsx`                                                                                                            | `components/guide-popover.tsx`                          |
| `search.tsx`                                                                                                           | `components/search-box.tsx`                             |
| `colours.ts`, `detail-cache.ts`                                                                                        | `lib/`                                                  |
| `guides.ts`                                                                                                            | `guides/guides.ts` (becomes markdown in phase 4)        |
| `rows.ts` (added after the plan)                                                                                       | `hooks/use-rows.ts`                                     |

- Windows: the checkout is case-insensitive. Every rename here also changes folder, so none is
  case-only; if one ever is, `git mv` it in two steps (`a.tsx` → `a.tmp.tsx` → `A.tsx`).
- Update the importers outside `src`: `test/*.test.ts` (`colours`, `store`, `theme`),
  `scripts/readme.ts` and `scripts/screenshots.ts` (they import `guides.ts` and `type View` from
  `store.ts`),
  the `#components`/`#lib`/`#stores` aliases, `eslint.config.js` globs (they already cover
  `src/**`), `.dependency-cruiser.cjs` paths, `scripts/third-party-licenses.ts` notes (the
  `components/ui` and `icons` paths don't move), and the paths named in `CLAUDE.md`.
- The `ui.ts` and `index.ts` exports keep the same names: the extension imports
  `Panel`, `createPanelStore`, `createThemeStore`, `isThemeChoice`, `prefersDark` and the theme
  types from `@stesura/wordgard-dev-tools-panel/ui`, and `AgentError`/`Transport` from `/transport`.

## Phase 3: split the large files (code moved verbatim) (executed 2026-11-06)

Code moves between files; nothing is rewritten. Each piece keeps its comments.

- **Schema** → `schema.tsx` (the tab), `schema-cards.tsx` (`Line`, `Tags`, `Links`, `Param`,
  `Card`, `NodeCard`, `MarkCard`, `GroupCard`, `GroupTags`), `schema-heading.tsx` (`Heading`,
  `Toggle`, `Clear`), `spec-pane.tsx` (`SpecPane`, `EffectiveJSON`, `SpecMenu`, `jsonOf`,
  `parseCard`), `schema-menu.tsx`, `schema-filters.ts` (`schemaFilters`, `noFilters`, `tagsOf`,
  `nodeTags`, `groupTags`, `pressedIn`).
- **Log** → `log.tsx`, `log-rows.tsx` (`Row`, `SortHeading`, sorting), `log-timeline.tsx`,
  `log-filters.tsx` (`FilterBar`, `UserEventFilter`, `SettingBox`, `FilterToggle`, `logFilters`,
  `matches`), `entry-pane.tsx` (`EntryPane`, `EntryView`, `Ranges`, `Values`, `Section`),
  `row-menu.tsx` (`RowMenu`, `rowText`), `log-format.ts` (`ms`, `slow`, `isSlow`, flags).
  `clock` and `pad` → `lib/time.ts`: Fields uses `clock` too, and a tab can't import another.
- **State** → `state.tsx`, `json-lines.ts` (pure: `Line`, `flatten`, `search`, `containers`,
  `childId`, `keysOf`, `nodePathOf`, `childOf`, `typeOf`), `state-menu.tsx`, `state-file.tsx`
  (`download`, `fileName`, the replace notice with its timers).
- **DOM**, **Fields**, **Selection**, **Structure**: helpers and sub-components out of the tab
  file as in the target layout; each tab file keeps the component and the wiring.
- **Panel** → `panel.tsx`, `panel-body.tsx`, `editor-picker.tsx`, `panel-controls.tsx`,
  `settings-menu.tsx`; `IconButton` and `ChoiceMenu` (and its `Choice` type) → `components/`.
- **Dock** → `dock.tsx`, `dock-layout.ts`.
- **node-pane.tsx** holds five unrelated things: `SelectionBar` → `tabs/selection/selection-bar.tsx`
  (Panel renders it under every tab); `isPrefix` → `lib/paths.ts`; `json` → `lib/json.ts`;
  `selectionType` → with `SelectionBar`; `Field`, `NodePane`, `PaneMenu` stay.
- **node-menu.tsx** → `lib/menu-anchor.ts` (`MenuAnchor`, `createMenuAnchor`, `focusedRow`,
  `rowIn`), `lib/selected-text.ts`, `lib/clipboard.ts` (`copy`), `components/copy-selection.tsx`
  (`CopySelection`, `useMenuSelection`), `components/node-menu.tsx` (`NodeMenu`,
  `createNodeMenuAnchor`).
- **detail-cache.ts**: `ROOT`, `itemId`, `pathOf`, `parentOf` → `lib/paths.ts`.
- `State.tsx`'s own `isRecord` goes; `lib/json.ts` holds the one from `stored.ts`.
  `errorMessage` (exported from `store.ts`, re-inlined in State) → `lib/json.ts`.
- `scrollInto` (exported from Structure, used by Schema) and `centreRow` (from search) →
  `lib/dom.ts`.
- New fast unit tests where the code is now pure and was only reached through the UI:
  `json-lines.ts`, `log-format.ts`, `schema-filters.ts`, `lib/paths.ts`. A few cases each.

## Phase 4: the tab registry, `dom`, guides as markdown (executed 2026-11-06)

### Tab registry

- `tabs/tabs.ts`: `export type Tab = "structure" | "selection" | …`, `export const TABS: readonly
{id: Tab; label: string}[] = [{id: "structure", label: "Structure"}, …]` and `isTab`. No `as
const` (the no-typecast rule): the `Record<Tab, …>` in the registry catches a tab missing there,
  and a test checks that `TABS` lists every tab once. It replaces `VIEWS` and `isView` in
  `store.ts`, `TAB_ORDER` in `guides.ts` and the `View` type. No React and no imports, so
  `scripts/readme.ts` and `scripts/screenshots.ts` import it under Node.
- `tabs/registry.tsx`: each tab's component (all take `{store, editorId}`) and guide, keyed by
  `Tab`, typed as a `Record<Tab, …>` so a missing tab fails the typecheck.
- `panel-body.tsx` maps the registry to the `TabsTrigger`s and the `TabsContent`s (`keepMounted`,
  `key={selected}`), replacing the 7 hand-written pairs. The Log trigger's recording dot stays:
  the registry entry takes an optional `badge` component, or `panel-body.tsx` special-cases `log`.
  Pick the one that reads better.

### `view` → `dom`, `View` → `Tab`

- Tab id `"view"` → `"dom"`; `PanelState.view` → `tab`; `setView` → `setTab`; the
  `store.get().view == "x"` checks in each tab follow.
- The saved panel layout (`wordgard-devtools:panel`, `{view, editor}`) is read with a fallback: a
  saved `view: "view"` reads as `"dom"`, and the old `view` key is read when `tab` is missing, so
  a user's last tab survives the update. Written as `{tab, editor}` from then on.
- The page-side request `{type: "view"}` and `ViewInfo` keep their names (protocol, out of scope).
  Inside the tab, the panel-side names follow the tab (`createDomSource`, `DomState`).
- The UI strings follow too: the tree's `aria-label="View"` → `"DOM"`, `"View status"` →
  `"DOM status"`, "Couldn't load the view" → "Couldn't load the DOM". `test/view.test.ts` →
  `test/dom.test.ts`, its selectors (lines 39, 54, 102) updated. The tab's label is already "DOM",
  so the e2e tests, which find tabs by name, don't change.
- `docs/screenshots/view.png` → `dom.png`; `scripts/screenshots.ts` writes `{tab: …}`.
  `npm run readme` regenerates the README.
- Tests that call `setView` or read `.view` follow.

### Guides as markdown

- One file per guide in `src/guides/`: `structure.md`, `selection.md`, `state.md`, `dom.md`,
  `schema.md`, `fields.md`, `log.md` (the tab guides, in the README), and `selection-detail.md`,
  `selection-bar.md`, `resolved-positions.md`, `schema-nodes.md`, `schema-marks.md`,
  `schema-groups.md`, `spec-effective-node.md`, `spec-effective-mark.md` (in the panel only).
- Format:

  ```md
  # Structure

  The document as nested boxes: … [plots](https://wordgard.net/docs/ref/#doc.Plot) …

  - from–to: [positions are offset numbers](https://wordgard.net/docs/ref/#h-resolved-positions) …
  - Hover a box to outline its node in the page; …
  ```

  Heading, then the summary (one paragraph), then the tips (a list, one line per item). Inline,
  only `` `code` `` and `[links](url)`: what the panel's `Text` renders. Full URLs instead of the
  `REF` constant, so the files read and click through in any markdown preview.

- `guides/parse.ts`: pure, `parseGuide(text) → {title, summary, tips}`. It throws on anything
  else: no heading, a second paragraph, nested lists, `**bold**`, HTML. Shared by the panel and
  `scripts/readme.ts`.
- `guides/guides.ts` (Vite only): `import.meta.glob("./*.md", {query: "?raw", import: "default",
eager: true})`, parsed once, exported as `GUIDES: Record<Tab, Guide>` and the named inner
  guides. A missing file fails at load time and in the test below.
- `scripts/readme.ts` reads `src/guides/<tab>.md` with `fs` in `TABS` order and uses `parse.ts`.
  The README marker comment points at `packages/panel/src/guides/`.
- Prettier formats markdown: `proseWrap` stays `"preserve"` (the default), so it doesn't rewrap
  the one-line tips. Check that `npm run format` leaves the guides as written.
- Tests: every tab has a guide; every `.md` parses; `guides.test.ts` (the panel rendering them)
  keeps passing.

### dependency-cruiser

Add the import rules from [Target layout](#target-layout), each with `dependencyTypesNot:
["type-only"]` on its `to`. "A tab doesn't import another tab" needs a group match, as
`no-cross-package-relative` already does: `from: {path: "^packages/panel/src/tabs/([^/]+)/"}`,
`to: {path: "^packages/panel/src/tabs/", pathNot: ["^packages/panel/src/tabs/$1/",
"^packages/panel/src/tabs/[^/]+$"]}`. The second `pathNot` lets a tab reach `tabs/tabs.ts`, which
sits beside the tab folders, not in one. CI runs these from phase 1 on.

## Phase 5: nanostores (executed 2026-11-06)

Dependencies: `nanostores` and `@nanostores/react` (devDependencies of the panel, as React is:
the build bundles them; CONTRIBUTING asks new runtime dependencies to be justified, this is about
1 kB). **Not** `@nanostores/persistent` (see [Review](#review-2026-11-06), findings 1 and 2): it
reads storage once at creation and again only on mount (and a store stays mounted 1 s after its
last listener, `STORE_UNMOUNT_DELAY`), and its writes aren't guarded.

What changes:

- **Persistence.** `stores/persistent.ts`: `persistent(key, fallback, read, write)` returns a
  nanostores `atom`. It reads `localStorage` once, at creation, guarded (blocked or unparsable →
  `fallback`, run through `read` as `stored.ts` does now), and its `set` writes guarded (blocked or
  full → the value lives in memory until reload, as now). It replaces `stored.ts` and the six
  try/catch pairs: the panel layout (`wordgard-devtools:panel`), the dock layout, the split-pane
  sizes, the Log's record settings, the Fields tab's last field, and the `stored()` values
  (guides shown, Log filters, Schema filters). Not the theme (below).
  - **Every persistent atom is created by a factory, never at module level.** `createPanelStore`
    creates the panel's settings (`store.settings.guidesShown`, `.logFilters`, `.schemaFilters`,
    `.logRecording`, `.lastField`, `.paneSizes`), shared by every tab and editor of that panel, as
    the module-level values are now; `renderDock` creates the dock layout. Why: today `stored.ts`
    re-reads storage on every `get`, and tests rely on it (they `localStorage.setItem` before
    `mountDevtools()`: `fields.test.ts:267`, `log.test.ts:325` and `436`, `mount.test.ts:210`,
    `copy-selection.test.ts:63`, `guides.test.ts:47`). A module-level atom read once would carry
    the previous test's value; one created per mount reads fresh.
  - Components without the store at hand (`GuidePopover` is used in a dozen places) read the
    settings through a context that `Panel` provides, as `PortalContainer` already does.
  - A test with a `localStorage` whose `getItem` and `setItem` throw: the panel mounts, filters
    and the layout still change, nothing throws from an event handler.
  - Storage keys and stored JSON shapes stay the same, except the panel layout's `view` → `tab`
    (phase 4). No `storage`-event sync between browser tabs (not needed).
- **The panel store.** `PanelState` becomes a `map`, read with `useStore`. The four
  `onXChanged` listener sets and the reveal slots (below) stay as plain events: they're
  notifications, not state. The request versioning (`run`, `selectionRun`), the per-frame
  coalescing and `start`/`pause` stay as they are.
- **Theme: unchanged.** `createThemeStore` keeps its hand-written lazy start and stop of the
  source: with `onMount` the source would unsubscribe 1 s late and `get()` on an unmounted store
  would subscribe it, breaking `theme.test.ts:25` and `36-37`. `localThemeStorage` stays a
  `ThemeStorage` (exported by `ui.ts`; the extension passes its own async one). Only its internal
  listener set may become an atom, if that reads better.
- **No `onMount` anywhere** without a test that covers the 1 s unmount delay: it's the trap
  above.
- **Per-editor sources** (`createXSource`): their `get`/`subscribe`/listener sets become atoms.
  Whether they're built on `createResource` (phase 6) or directly on atoms is settled in phase 6;
  doing this phase first means `createResource` is written once, on atoms.
- **The menu anchor**'s target is an atom.
- Components read with `useStore(atom)` instead of `useSyncExternalStore(x.subscribe, x.get)`.
- The public API (`ui.ts`) keeps its names and call shapes: `createPanelStore(transport)` with
  `get`, `subscribe`, `start`, `pause`… If `PanelStore.get`/`subscribe` change meaning, the
  extension (`packages/extension/entrypoints/devtools-panel/main.tsx`) is updated in the same
  phase, and e2e covers it.

Don't convert what's local UI state (`useState` for a collapsed set, a focused row) into atoms.

## Phase 6: deduplicate (executed 2026-11-06)

In order of payoff. Each one is done only if the result reads at least as well as before (decision
6). Note each skip, and why, in the implementation notes.

1. **`IconButton` everywhere.** About 40 places wrap a `Button` in a `Tip`, with the label written
   twice (tooltip and `aria-label`). `IconButton` exists but only Panel and Dock use it. Extend it
   with what the tabs need (`disabled`, `render` for the file input's `<label>`, `side`) and use it.
2. **Loading while the tab is shown.** Seven tabs repeat the same ref callback: load when shown;
   when hidden, mark stale and load on showing; some also take a reveal and drop the page outline
   when hidden. One helper, e.g. `whileShown(store, {tab, editorId, on: "doc" | "state" | "config"
| "log", load, onHide, onShow})` returning the cleanup, called from the ref callbacks. Keep it a
   plain function (no `useEffect`).
3. **`<LoadError what onRetry>`** for the seven "Couldn't load the X: … Retry" banners.
4. **`createResource(fetch)`** for the five near-identical versioned loaders (structure, schema,
   state, dom, the selection's main load): drop replies to an older load, keep the last value with
   the error. `structure-source` and `schema-source` also need `ready()`.
5. **`createPromiseCache(fetch, size = 32)`** for the four caches with `KEPT = 32`, in three
   files (node details; field details and field changes; log entries).
6. **The store's events.** Four `onXChanged` + four listener sets → `on(event, listener)`.
   **Likely skip** the reveals: merging the four `showX`/`takeXReveal` pairs into
   `reveal(tab, editorId, target)` needs a per-tab mapped type and a generic signature for four
   different targets, harder to read than four named pairs.
7. **Fire-and-forget sends.** About 25 `transport.send(…).catch(() => {})` → `store.fire(request)`
   (the other `.catch(() => {})`s are on copies and the theme, and stay).
8. **Highlight in the page.** The `outlined` ref and highlight callback in Structure, State and
   DOM → one helper.
9. **`<ExpandCollapse onExpand onCollapse>`** in Structure, State and DOM.
10. **`<Toolbar>`**, **likely skip**: of the 11 strips with `border-b bg-strip px-2`, heights
    (`h-7`, `min-h-7`, `min-h-8`), wrapping, `font-sans`/`text-xs`, `sticky` and `border-y` all
    vary (`Selection.tsx:336,401`, `Schema.tsx:659,877`). Only the five fixed `h-7` tab toolbars
    (Structure, State, DOM, Fields, Log) are the same; a `Toolbar` for those alone, if it helps.
11. **Schema's three sections** (nodes, marks, groups): copy-pasted JSX → one `SchemaSection` fed
    by a small config per kind.
12. **`InspectSection`**, **maybe**: the Log's and the Selection's `Section` (a focusable card with a
    "Log / Copy JSON" context menu) are close, but the Selection's has `fixed`, `code`, "Clear" and
    a disabled copy. Merge only if the props stay few; otherwise share the menu only.
13. **`ChoiceMenu`'s radio group** reused by the Dock's `ReopenSettings`.
14. **Small helpers to `lib/`**: `toggled` (Log, Schema), `includes`/`matches` (search, Schema),
    `pathOf` (four versions: detail-cache, node-menu, DOM, Structure's `pathOfItem`).
15. **`ContextMenuItem className="text-xs"`** (28 times): make `text-xs` the item's default in
    `components/ui/context-menu.tsx` (our copy) and drop it at the call sites. (The dropdown
    menus' items don't all set it: leave `dropdown-menu.tsx` alone.)
16. **Maybe:** State and DOM both implement a virtualized, collapsible tree with keyboard
    navigation. A shared `useTreeNav` only if it doesn't need many parameters; the likely outcome is
    to leave them separate.

## Phase 7: shadcn (executed 2026-11-06)

Add each with `npx shadcn add <name>` (from `packages/panel`), then:

- rewrite its icon imports to `#icons` (adding any icon it needs to `icons/heroicons.tsx`, from
  Heroicons 16/solid), and remove `lucide-react` if `shadcn add` added it to `package.json`
  (`iconLibrary: "lucide"` makes it do so);
- add its Base UI subpath (`@base-ui/react/toggle`, `toggle-group`, `checkbox`, `collapsible`) to
  `optimizeDeps.include` in `packages/panel/vite.config.ts`: a dependency found mid-run reloads the
  browser tests;
- check it renders inside the shadow root (popups through `PortalContainer`);
- end the phase with `npm run format` (shadcn writes its own style).

- **Toggle**: Schema's `Toggle` and the Log's `FilterToggle` → shadcn `toggle` (Base UI's,
  `aria-pressed` handled), with a size and variant for the dense filter chips (h-5, `text-xs`).
  Schema's "order: schema | rank" → `toggle-group` (single). The three section switches
  (nodes / marks / groups) → `toggle`s.
- **Checkbox**: the Log's record settings (`SettingBox`) and the user-event filter's checkboxes →
  shadcn `checkbox`, with its label.
- **Collapsible**: the Schema sections (`Heading`'s title button and the stretch after the filters
  toggle the section) and the Fields history items (a chevron that opens the change's value). Not
  the Structure, State and DOM trees: their items carry `role="treeitem"` and `aria-expanded`
  themselves, and collapsible's trigger and panel would fight the tree semantics.
- `components.json` keeps `iconLibrary` as is (shadcn has no heroicons option); the steps above
  are the fix, written down in `CLAUDE.md` (phase 8) so the next `shadcn add` follows them too.

## Phase 8: docs

- `CLAUDE.md`: the layout lines for the panel; "guides are markdown in
  `packages/panel/src/guides/`"; the `shadcn add` steps (phase 7); `npm run format`; and the
  dependency-cruiser script's name: it says `npm run deps`, but the script is
  `npm run dependency-check`.
- `CONTRIBUTING.md`: `npm run format`, the folder rules.
- `packages/panel/README.md`, if it names files.
- Mark this plan executed phase by phase, with deviations, and move it to `docs/executed/` when done
  (or `docs/partially-executed/` until then).

## Risks

- **React Compiler.** `npm run compiler:check` must stay green: moving components between files
  doesn't change compilation, but new hooks (`whileShown` if it becomes a hook, `useStore`) do.
  Lint (the Rules of React) runs every phase.
- **Shadow DOM.** New shadcn components portal through `PortalContainer`; checkbox and toggle
  don't portal, but collapsible's animation relies on CSS variables that must exist in the adopted
  sheet.
- **Behaviour.** The tests are browser integration tests and cover most of the panel; phases 2
  and 3 must pass them unchanged (apart from import paths). From phase 4 on, a test that changes
  says why in the notes.

## Review (2026-11-06)

A Fable review of this plan, each finding checked against the code (and, for nanostores, the
published source of `nanostores` 1.5.5 and `@nanostores/persistent` 1.3.5). All 14 held up and
the plan above includes them:

1. `@nanostores/persistent` reads storage at creation and on mount only, and a store stays mounted
   1 s after its last listener: module-level persistent atoms would carry one test's value into
   the next. → Phase 5: our own `persistent()` on `atom`, every one created by a factory.
2. Its writes aren't guarded (`storageEngine[name] = …`): a full or blocked storage would throw from
   an event handler. → Phase 5: guarded writes, and a test with a throwing `localStorage`.
3. Theme as `computed` + `onMount` breaks `theme.test.ts` (late unsubscribe, `get()` subscribing).
   → Theme unchanged.
4. `no-restricted-syntax: FunctionExpression` also flags methods, and
   `scripts/third-party-licenses.ts:94` needs one (Rollup's `this`). → Phase 1: the selector
   excludes methods.
5. The format commit touches about 70 TS files, not only the semicolon files. → Phase 1 says so,
   and phase 7 ends with `npm run format`.
6. CI doesn't run dependency-cruiser, and `CLAUDE.md` names it `deps`. → CI step in phase 1,
   `CLAUDE.md` in phase 8.
7. New Base UI subpaths need `optimizeDeps.include`; `shadcn add` adds `lucide-react`. → Phase 7.
8. `view` → `dom` missed the aria labels, the error text and `test/view.test.ts`. → Phase 4.
9. `clock` must reach `lib/` in phase 3, or phase 4's "no tab imports another" fails. → Phase 3.
10. The layer rules need a type-only exemption (`lib/colours.ts` takes a React type; the guide
    button takes a tab type). → Target layout and phase 4.
11. The `as const` on `TABS` is avoidable. → Phase 4: an explicit `Tab` union.
12. Readability risks in the dedup: the merged reveals, `Toolbar`, `InspectSection`. → Phase 6
    marks them likely skip / maybe.
13. Counts: four caches in three files; about 25 of the 30 `.catch(() => {})` are on sends; the
    dropdown items don't set `text-xs`. → Corrected.
14. `.gitattributes` is safe: the index is all LF. → Phase 1 adds it, no longer asks.

Found while applying them: the tab-to-tab rule's `pathNot` must also let a tab import
`tabs/tabs.ts` (phase 4).

## Open points

- None yet. (Settled 2026-11-06: Prettier in `../react-wordgard`'s style; no `input-group`.)

## Implementation notes

### Phases 0 and 1 (2026-11-06)

- Phase 0: deleted `packages/panel/.vitest/` and `packages/devtools/.vitest/`. Ten of the
  devtools screenshots (a deleted `probe.test.ts`'s failures) had been committed by accident in
  the scaffold commit, before `.vitest` was ignored: their deletion is part of this commit. No
  other junk: nothing untracked, no `__screenshots__`.
- Phase 1: Prettier 3.9.10 in `../react-wordgard`'s style (`.prettierrc.json`), `format` and
  `format:check` scripts, CI steps "Format" and "Dependency rules", `.gitattributes`
  (`* text=auto eol=lf`). Added at the user's request: `prettier-plugin-tailwindcss`
  (`tailwindStylesheet: packages/panel/src/styles.css`, the only Tailwind stylesheet; the demo
  and the extension build the panel's), which sorts classes in `className` and in `cn()` /
  `cva()`. 150 files reformatted. The README's generated Tabs section is
  Prettier-stable (`readme:check` passes).
- ESLint: the arrow-function rule applies to every `ts`/`tsx`/`js`/`cjs`/`mjs` file, with "Use an
  arrow function." as its message. Checked that it flags a declaration, an expression and a
  `function` callback, and not a class method or an object method.
- Deviations:
  - `.prettierignore` also skips `**/LICENSE` and `**/LICENSE.md`: copied licence texts stay as
    their authors wrote them.
  - `test/schema.test.ts`: three tests were already failing on HEAD. `ea18c7c` changed the JSON
    pane's label from "node type" / "mark type" to "node" / "mark" without updating the test.
    The test now expects the new labels.
- Checks: typecheck, lint, `npm test` (87 devtools + 145 panel + 12 extension tests), build,
  `compiler:check`, `format:check`, `readme:check`, `release:check`, `dependency-check`: all pass.
  (e2e isn't due until phase 2.)

### Phase 2 (2026-11-06)

- 32 files moved with `git mv` by a script that then rewrote the relative import specifiers the
  moves broke: an import into `components/`, `lib/`, `stores/` or `hooks/` from another folder
  uses the `#` alias, any other import stays relative. Only import lines changed, plus the path
  named in `scripts/readme.ts` and the README's marker comment, and `CONTRIBUTING.md`'s path to
  `useRows`. Git records all 32 as renames.
- Aliases `#lib/*`, `#stores/*`, `#hooks/*` in the panel's `package.json` `imports` and
  `tsconfig.json` `paths`.
- Deviation: `rows.ts` (`useRows`, added in `d445df2`, after the plan was written) is a React
  hook shared by Log, State and DOM. `lib/` has no React, so it went to a new `hooks/` folder,
  `hooks/use-rows.ts`, with its own alias. The target layout and import rules now list `hooks/`.
- Not yet: the cross-tab imports (Schema → Structure's `scrollInto`, Fields → Log's `clock`) stay
  until phase 3, as planned.
- Checks: typecheck, lint, tests (87 + 145 + 12), build, `compiler:check`, `format:check`,
  `readme:check`, `dependency-check`, e2e (11): all pass.

### Phase 3 (2026-11-06)

- Split with a script on the TypeScript AST: each top-level declaration moved verbatim with its
  leading comments; each new file got the imports it uses (unused ones removed by TypeScript's
  `organizeImports`, "remove unused" mode), and `export` was added only where another file
  imports the name. Importers elsewhere were repointed the same way. Then Prettier.
- Imports whose names are all types became `import type {…}`: under `verbatimModuleSyntax`,
  `import { type A }` stays a runtime import, which would count in dependency-cruiser's cycle check.
- The largest files now: `stores/panel-store.ts` 397 lines (phases 5 and 6), `tabs/state/state.tsx`
  393, `tabs/log/log.tsx` 330, `tabs/schema/schema.tsx` 327. Every tab file holds the tab
  component and its wiring; helpers and sub-components are beside it.
- Cross-tab imports are gone: `clock` → `lib/time.ts`, `scrollInto` and `centreRow` →
  `lib/dom.ts`. `json`, `isRecord` and `errorMessage` → `lib/json.ts` (State's own `isRecord`
  removed); `isPrefix` and the path helpers from `detail-cache.ts` → `lib/paths.ts`.
- New `test/pure.test.ts` (6 tests): `lib/paths`, `lib/time`, `json-lines`, `log-format`,
  `schema-filters`.
- Deviations from the planned names (the code decided):
  - State: `state-file.ts` (no JSX: `download`, `fileName`, `replaceFrom`, the notice's type and
    timings; the notice's state stays in the tab) and `state-row.tsx` (`Row`, its colours).
  - DOM: `dom-lines.ts` (pure: `flatten`, `search`, `lineOf`, `folders`, `pathOf`), mirroring
    State's `json-lines.ts`, and `dom-row.tsx`.
  - Fields: `field-menu.tsx` (the list's menu); the history's menu sits in `field-history.tsx`, the
    value's in `field-view.tsx`, next to what they open on.
  - Structure: `search`, `folders`, `itemOf`, `pathOfItem` stay in `structure.tsx` (small, used
    only there); `boxes.tsx` holds `Box`, `Chip` and their helpers.
  - Dock: `sides`, `corners` and `ReopenSettings` stay in `dock.tsx` (they hold JSX icons);
    `dock-layout.ts` has the layout, its storage and the placement tables.
  - Schema: the `Kind` and `Go` types live in `schema-cards.tsx`; `schema-filters.ts` imports
    `Kind` as a type.
  - Log: `label` (a heading class helper) in `log-format.ts`.
  - Done early, from phase 6 item 14: `includes` → `lib/text.ts`. The pure `json-lines.ts` and
    `dom-lines.ts` would otherwise import it from a React component file.
- Checks: typecheck, lint, tests (87 + 151 + 12), build, `compiler:check` (counts unchanged:
  panel 133, extension 128, demo 134), `format:check`, `readme:check`, `dependency-check` (no
  cycles, no orphans): all pass.

### Phase 4 (2026-11-06)

- `tabs/tabs.ts`: the `Tab` union, `TABS` (id and label, in order) and `isTab`. No `as const`, no
  imports. It replaces `View`, `VIEWS`, `isView` and `TAB_ORDER`.
- `tabs/registry.tsx`: `TAB_COMPONENTS: Record<Tab, ComponentType<TabProps>>`. The guides stay
  in `GUIDES` (already a `Record<Tab, Guide>`), so the registry holds components only.
  `panel-body.tsx` maps `TABS` to the triggers and the contents; the Log's recording dot is a
  special case in the trigger (one line, clearer than a `badge` slot in the registry).
- `view` → `dom`: the tab id, `PanelState.tab`, `setTab`; the DOM tab's component is `Dom`, its
  source `createDomSource`/`DomSource`/`DomState`; its aria labels "DOM" and "DOM status", its
  error "Couldn't load the DOM". `test/view.test.ts` → `test/dom.test.ts`;
  `docs/screenshots/view.png` → `dom.png`. The saved panel layout is written as `{tab, editor}`
  and read from `tab` or, saved before this, `view` (`"view"` reads as `"dom"`); a test covers it.
- Guides: 15 markdown files in `src/guides/`, generated from the old `guides.ts` so the text is
  unchanged (the regenerated README differs only in the marker comment and the DOM screenshot's
  name). Prettier leaves them as written. `guides/parse.ts` (plain TypeScript, Node runs it)
  also accepts a summary wrapped over several lines and a tip continued on an indented line,
  so an editor's soft wrap doesn't break a guide. It refuses bold, HTML, images, nested lists
  and extra blocks. `guides/guides.ts` loads them with `import.meta.glob(?raw)`; `GuideButton`
  takes the `Guide` instead of a tab id. `scripts/readme.ts` reads the files with `fs`.
- dependency-cruiser: `panel-lib-plain`, `panel-stores-below-ui`, `panel-components-below-tabs`,
  `panel-tabs-apart`, `panel-tabs-list-plain`. Checked with throwaway files that break them
  (a tab importing another, `lib/` importing React and a component, a component importing a
  tab): all four caught.
- Deviation: `stores/panel-store.ts` needs `isTab` at runtime, so `tabs/tabs.ts` (plain data, no
  imports) is open to every layer; each rule's `pathNot` lets it through.
- Tests: `pure.test.ts` + 2 (the tab list and its guides; the guide parser), `store.test.ts` + 1
  (the saved-tab migration).
- Checks: typecheck, lint, tests (87 + 154 + 12), build, `compiler:check` (panel 132, extension
  127, demo 133: one memo slot fewer each, from the tab bar's map; `panicThreshold: "all_errors"`
  means every component still compiles), `format:check`, `readme:check`, `dependency-check`,
  e2e (11): all pass.

### Phase 5 (2026-11-06)

- `nanostores` and `@nanostores/react` (panel devDependencies, bundled; both in
  `optimizeDeps.include`).
- `stores/persistent.ts`: `persistent(key, fallback, codec)` returns an `atom`, read once when
  created and written on each change, both guarded; `asJSON(read, write)` is the usual codec.
  Storage keys and formats are unchanged: the Log's record settings stay `"true"`/`"false"` and
  the Fields tab's last field a bare name, through their own small codecs. `stores/stored.ts` is
  gone (`stringSet` moved to `lib/json.ts`).
- Who creates what (never at module level):
  - `createPanelStore`: the panel layout (`wordgard-devtools:panel`).
  - `renderDock`: the dock layout (`createDockLayout`); `Dock` reads it with `useStore`, and a
    drag's live size stays local until the drag ends, then is saved.
  - `Panel`: `createPanelSettings()` (guides shown, split-pane sizes per kind), given to
    components through `PanelSettingsContext` (`components/panel-settings.tsx`).
  - The tabs, as they mount: the Log and Schema filters (`createLogFilters`,
    `createSchemaFilters`), the Fields tab's last field; `createLogSource`: the record settings.
    Tabs remount per editor, so they read storage fresh as `stored()` used to.
- Deviation: the plan put the settings on `createPanelStore`. The Log and Schema filter types and
  codecs belong to their tabs, and `stores/` can't import tabs, so each owner creates its own,
  as above. Same effect: one per mount, nothing at module level.
- `PanelStore`: `get`/`subscribe` are replaced by `state: ReadableAtom<PanelState>` (an `atom`,
  not a `map`: every change is a merged patch). Components read `useStore(store.state)`, tabs
  `store.state.get()` and `store.state.listen(…)`. The extension only calls `start`, so it
  doesn't change. The events (`onDocChanged`…) and reveals stay as they were (phase 6).
- Sources: each has a `state` atom in place of its getters and listener set. The loaders' logic is
  unchanged: the Log source, the selection source and the panel store keep their working copy
  and publish it. `DetailSource.version` is an atom, set when a load lands (it was a counter bumped
  when one started and read after the notification: the same in practice). The Fields version is
  part of its state.
- The menu anchor's target is an atom (`anchor.target`).
- Theme: unchanged, as planned.
- Found and fixed on the way: the Schema's section switch read the filters of the last render,
  so two quick clicks lost the first (`schema.test.ts` caught it); it reads the latest now. The
  React Compiler refused two `useCallback`s whose dependencies no longer matched (the filters'
  atom, and `go`, now a `useCallback` itself).
- New `test/storage.test.ts`: with `getItem` and `setItem` throwing, the panel mounts, the guides
  turn off, the dock closes and opens, and nothing throws. Checked that it fails with the write
  guard removed.
- Checks: typecheck, lint, tests (87 + 155 + 12), build, `compiler:check` (panel 125, extension
  120, demo 126: `useStore(atom)` caches fewer values than `useSyncExternalStore(x.subscribe,
x.get)`; every component still compiles), `format:check`, `readme:check`, `dependency-check`,
  e2e (11): all pass.

### Phase 6 (2026-11-06)

Item by item (the plan's numbering). About 500 lines fewer across 43 files.

1. **Done.** `IconButton` takes any `Button` prop and renders through `Tip`; 17 Tip-and-Button
   pairs converted by a script, only where the tooltip and the accessible name were the same
   string. The 23 `Tip`s left wrap text or badges, or name a shortcut in the tooltip only
   ("Previous match (Shift+Enter)").
2. **Done, six of seven.** `stores/while-shown.ts`: `whileShown(store, {tab, editorId, on, load,
onHide?, onReveal?, reconnect?})`, a plain function returning the cleanup, used by Structure,
   State, DOM, Schema, Selection and Log. Fields keeps its own: it starts and stops watching the
   page's fields as it's shown and hidden, and resets that on a reconnect; a helper covering it
   would need three more hooks.
3. **Done.** `components/load-error.tsx`, in all seven tabs.
4. **Done, six loaders.** `stores/resource.ts`: `createResource(fetch)` gives `{state: {value,
error, version}, load, ready}`. Structure, Schema, State, DOM, the selection's detail and the
   Fields list are built on it; the sources are now 8 to 56 lines. The Log source stays as it is
   (incremental rows, record settings). Consumers rename on destructuring
   (`const {value: doc, error}`); State's `loaded` is `json != null`. `DetailSource` reads the
   version from `state`. The selection's typed position is its own atom, `probed`.
5. **Done.** `lib/promise-cache.ts`, in the four caches.
6. **Done: the events.** `store.on(change, listener)` with `Change = "doc" | "state" | "config" |
"log"` replaces the four `onXChanged` and their listener sets. **Skipped: the reveals**, as
   planned (four named pairs read better than one generic slot).
7. **Done.** `fire(transport, request)` in `transport.ts`, at 24 call sites (store, tabs,
   sources). The `.catch(() => {})`s left are on copies and on the theme's async storage.
8. **Done.** `lib/outline.ts` (`createOutline`: `show`, and `hide` only if it drew one), in
   Structure and State. DOM keeps its source's `hideOutline`: its outline is drawn by an element
   action, not a node path.
9. **Done.** `components/expand-collapse.tsx`, in Structure, State and DOM.
10. **Skipped.** Even the five fixed tab toolbars differ (`gap-1` or `gap-2`).
11. **Done.** `SchemaSection` (in `schema-heading.tsx`, beside `Heading`): the section, its bar,
    its open body and its "no match" line. The three call sites stay explicit (their cards,
    filters and the Marks' order switch differ); a config array would have hidden that.
12. **Skipped.** The Log's and the Selection's sections differ in layout (a heading, or a bordered
    card with code and a fixed height) and in their menus ("Copy as JSON" or "Copy JSON", Clear):
    merging needs more props than it saves.
13. **Done.** `ChoiceGroup` (the labelled radio group) out of `ChoiceMenu`, used by the dock's
    reopen settings too.
14. **Done.** `lib/sets.ts` (`toggled`, generic); the Schema's `matches` is `includes`;
    `lib/paths.ts` gains `parsePath` and `dataPath`, which replace the DOM tab's `pathOf`,
    node-menu's and the Structure's `pathOfItem`.
15. **Done.** `text-xs` is the context menu item's default (`components/ui/context-menu.tsx`, with
    a comment); dropped at all 42 call sites.
16. **Skipped.** State's and DOM's keyboard handling differ (DOM has no closing lines; State's
    ArrowLeft goes to the parent): a shared hook would need a parameter per difference.

Checks: typecheck, lint, tests (87 + 155 + 12), build, `compiler:check` (panel 122, extension
119, demo 123), `format:check`, `readme:check`, `dependency-check`, e2e (11): all pass.

### Phase 7 (2026-11-06)

- `npx shadcn add toggle toggle-group checkbox collapsible`. It didn't add `lucide-react` to
  `package.json`, but `checkbox.tsx` imported its `CheckIcon` from it: now from `#icons`. The four
  files follow the other `components/ui` files: arrow functions (the lint rule), no
  `"use client"`, and no cast in `toggle-group.tsx` (its `--gap` CSS variable is declared on
  React's `CSSProperties`, as `--hue` is in `lib/colours.ts`). Their Base UI subpaths are in
  `optimizeDeps.include`.
- **Toggle.** A `chip` variant and size in `ui/toggle.tsx` (h-5, `text-xs`, muted, primary while
  pressed: the old look). `components/filter-chip.tsx` (`FilterChip`) replaces the Schema's
  `Toggle` and the Log's `FilterToggle`: the Schema's tag filters and section switches, the Log's
  "changed" and annotation filters (in `font-mono`).
- **Toggle group** (one of two; pressing the pressed one keeps it): the Marks' order (schema /
  rank) and, beyond the plan, the JSON pane's Spec / Effective, the same kind of switch. The amber
  "an override changes it" look is now in `aria-pressed:` classes.
- **Checkbox.** The Log's user-event filter ("All", indeterminate when some are ticked, and one
  per event) and its two record settings. `test/log.test.ts` now reads `role="checkbox"` and
  `aria-checked` (`"mixed"` for indeterminate) instead of the native input's `checked` and
  `indeterminate`: Base UI's checkbox isn't an `<input>`, and `aria-checked` is what assistive
  technology reads.
- **Collapsible.** `SchemaSection` is a `Collapsible` (controlled: the toolbar's section chips
  and the bar's empty stretch still toggle it); its title is the trigger. The Fields history items
  too: the chevron is the trigger, the change's value the content.
- Looked at the Schema and Log tabs in the demo (a one-off run of the screenshots script into a
  scratch folder): chips and checkboxes as before.
- Checks: typecheck, lint, tests (87 + 155 + 12), build, `compiler:check` (panel 123, extension
  120, demo 124), `format:check`, `readme:check`, `dependency-check`, e2e (11): all pass.
