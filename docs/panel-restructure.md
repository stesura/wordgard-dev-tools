# Panel restructure — plan

Status: NOT EXECUTED. Drafted 2026-11-06 from an audit of `packages/panel`, scope agreed with the
user the same day.

Scope: `packages/panel` only, plus what has to follow it (root lint and format config, the scripts
that import panel files, docs). The page side (`packages/devtools`) and its protocol don't change:
the `"view"` *request* keeps its name, only the panel's tab is renamed.

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
7. shadcn: `toggle` / `toggle-group`, `checkbox`, `input-group` and `collapsible`, yes. A plain
   shadcn `input` for the search fields, no (its styling would have to be stripped). `alert`, no.
   Icons: heroicons (`#icons`), never lucide.
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
  `npm run format:check`. `npm run e2e -w wordgard-devtools-extension` runs at the end of phases
  2, 4, 5 and 7.
- One phase per commit: the user commits between phases (agents never run `git commit` or
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
    persistent.ts        the persistent-atom helper (phase 5; replaces stored.ts)
    resource.ts          createResource (phase 6)
  tabs/
    tabs.ts              TABS: id, label, in order. Plain data: scripts import it under Node
    registry.tsx         TABS plus each tab's component and guide, for panel-body.tsx
    structure/  structure.tsx, boxes.tsx, structure-source.ts
    selection/  selection.tsx, selection-cards.tsx, selection-bar.tsx, selection-source.ts
    state/      state.tsx, json-lines.ts, state-menu.tsx, state-file.tsx, state-source.ts
    dom/        dom.tsx, dom-rows.tsx, dom-menu.tsx, dom-status.tsx, dom-source.ts
    schema/     schema.tsx, schema-cards.tsx, schema-heading.tsx, spec-pane.tsx,
                schema-menu.tsx, schema-filters.ts, schema-source.ts
    fields/     fields.tsx, field-view.tsx, field-history.tsx, field-menus.tsx, fields-source.ts
    log/        log.tsx, log-rows.tsx, log-timeline.tsx, log-filters.tsx, entry-pane.tsx,
                row-menu.tsx, log-format.ts, log-source.ts
  components/            shared app components (React)
    icon-button.tsx  choice-menu.tsx  tip.tsx  copy-button.tsx  copy-selection.tsx
    type-link.tsx  clear-filters.tsx  guide-popover.tsx  search-box.tsx  split-pane.tsx
    node-pane.tsx  node-menu.tsx  load-error.tsx  toolbar.tsx  expand-collapse.tsx
    inspect-section.tsx  portal.tsx
  components/ui/         shadcn only, generated, then icons rewritten to #icons
  lib/                   no React
    colours.ts  clipboard.ts  selected-text.ts  menu-anchor.ts  paths.ts  json.ts
    dom.ts (scrollInto, centreRow)  sets.ts (toggled)  promise-cache.ts  detail-cache.ts
  icons/
  guides/                *.md, plus parse.ts (pure) and guides.ts (loads them, Vite only)
```

The exact split of each tab follows the code; the names above are the intent. A file stays whole
when splitting it would scatter one idea across files.

Import rules, enforced by dependency-cruiser (phase 4):

- `lib/` imports nothing from `components/`, `tabs/`, `panel/` or `stores/` (except types), and
  no React.
- `stores/` doesn't import `components/`, `tabs/` or `panel/`.
- `components/` doesn't import `tabs/` or `panel/`.
- A tab doesn't import another tab. Today Schema takes `scrollInto` from Structure and Fields takes
  `clock` from Log; both move to `lib/` (and `tabs/log/log-format.ts` respectively, then `lib/` if
  Fields still needs it).
- `tabs/tabs.ts` imports nothing (Node scripts load it).

Import aliases: `#components/*` stays as it is (`./src/components/*.tsx`: shadcn's
`components.json` writes `#components/ui/x`, with no extension). Add `#lib/*` → `./src/lib/*` and
`#stores/*` → `./src/stores/*`, used with the extension, as relative imports are, in `package.json`
`imports` and `tsconfig.json` `paths` both. Within a folder, and from a tab to its own files,
imports stay relative.

## Phase 0: junk

- Delete `packages/panel/.vitest/` (ignored, but full of failure screenshots of tests that no
  longer exist: `tree`, `zz-probe`, `zz-tmp-layout`, `*.scratch`, `flip`, `shot`, `fields-empty`).
- Delete any other `__screenshots__` / `.vitest` directories in the repo.
- `scripts/bench-tmp.ts`, listed as untracked in the audit, is already gone; check that nothing
  else untracked is a leftover (`git status --short --untracked-files=all`) and ask before
  deleting anything that isn't obviously scratch.

## Phase 1: Prettier and arrow functions

- Add `prettier` (root devDependency), `.prettierrc.json` and `.prettierignore` (`dist`, `.output`,
  `.wxt`, `node_modules`, `package-lock.json`, `docs/screenshots`).
- Style: the one most of the repo already uses, so the format commit mostly touches the five
  semicolon files: `{"semi": false, "bracketSpacing": false, "arrowParens": "avoid",
  "printWidth": 120, "endOfLine": "lf"}`, double quotes (the default), trailing commas `"all"`
  (the default).
  **Open to the user:** `../react-wordgard` uses `semi: true`, `printWidth: 100`. Matching it
  instead means reformatting nearly every file. The plan assumes the repo's majority style.
- Scripts: `"format": "prettier --write ."`, `"format:check": "prettier --check ."`. CI step
  "Format" after "Lockstep versions".
- Format the whole repo once (not only the panel: the config is root-level, and a half-formatted
  repo fails `format:check`). This is the whole of the commit: no other change.
- `.gitattributes` with `* text=auto eol=lf`: git currently warns that LF will become CRLF in the
  panel files, and Prettier's `endOfLine: lf` would fight a CRLF checkout. Check with the user
  before adding it if it renormalises many files.
- ESLint: a block for every TS file in the repo (not only the React ones) with
  `"no-restricted-syntax": ["error", "FunctionDeclaration", "FunctionExpression"]` and
  `"prefer-arrow-callback": "error"`. Class methods stay allowed (`AgentError`). There are no
  `function`s in the repo today; the rule keeps it that way. If a generator or a `this`-binding
  function is ever needed, it gets an `eslint-disable-next-line` with the reason.
- `eslint-config-prettier` isn't needed: no stylistic ESLint rules are enabled.

## Phase 2: move and rename (no code changes)

Only `git mv` and the import specifiers that the moves break. No splits, no edits to logic, so
git records renames and the diff is reviewable.

| Now | After |
|---|---|
| `Panel.tsx` | `panel/panel.tsx` |
| `Dock.tsx` | `panel/dock.tsx` |
| `store.ts` | `stores/panel-store.ts` |
| `theme.ts`, `stored.ts` | `stores/` |
| `Structure.tsx`, `structure-source.ts` | `tabs/structure/structure.tsx`, `…/structure-source.ts` |
| `Selection.tsx`, `selection-source.ts` | `tabs/selection/selection.tsx`, `…/selection-source.ts` |
| `State.tsx`, `state-source.ts` | `tabs/state/state.tsx`, `…/state-source.ts` |
| `View.tsx`, `view-source.ts` | `tabs/dom/dom.tsx`, `tabs/dom/dom-source.ts` |
| `Schema.tsx`, `schema-source.ts` | `tabs/schema/schema.tsx`, `…/schema-source.ts` |
| `Fields.tsx`, `fields-source.ts` | `tabs/fields/fields.tsx`, `…/fields-source.ts` |
| `Log.tsx`, `log-source.ts` | `tabs/log/log.tsx`, `…/log-source.ts` |
| `tip.tsx`, `copy-button.tsx`, `type-link.tsx`, `clear-filters.tsx`, `split-pane.tsx`, `node-pane.tsx`, `node-menu.tsx` | `components/` |
| `guide.tsx` | `components/guide-popover.tsx` |
| `search.tsx` | `components/search-box.tsx` |
| `colours.ts`, `detail-cache.ts` | `lib/` |
| `guides.ts` | `guides/guides.ts` (becomes markdown in phase 4) |

- Windows: the checkout is case-insensitive. Every rename here also changes folder, so none is
  case-only; if one ever is, `git mv` it in two steps (`a.tsx` → `a.tmp.tsx` → `A.tsx`).
- Update the importers outside `src`: `test/*.test.ts` (`colours`, `store`, `theme`),
  `scripts/readme.ts` and `scripts/screenshots.ts` (they import `guides.ts` and `store.ts`),
  the `#components`/`#lib`/`#stores` aliases, `eslint.config.js` globs (they already cover
  `src/**`), `.dependency-cruiser.cjs` paths, `scripts/third-party-licenses.ts` notes (the
  `components/ui` and `icons` paths don't move), and the paths named in `CLAUDE.md`.
- The `ui.ts` and `index.ts` exports keep the same names: the extension imports
  `Panel`, `createPanelStore`, `createThemeStore`, `isThemeChoice`, `prefersDark` and the theme
  types from `@stesura/wordgard-dev-tools-panel/ui`, and `AgentError`/`Transport` from `/transport`.

## Phase 3: split the large files (code moved verbatim)

Code moves between files; nothing is rewritten. Each piece keeps its comments.

- **Schema** → `schema.tsx` (the tab), `schema-cards.tsx` (`Line`, `Tags`, `Links`, `Param`,
  `Card`, `NodeCard`, `MarkCard`, `GroupCard`, `GroupTags`), `schema-heading.tsx` (`Heading`,
  `Toggle`, `Clear`), `spec-pane.tsx` (`SpecPane`, `EffectiveJSON`, `SpecMenu`, `jsonOf`,
  `parseCard`), `schema-menu.tsx`, `schema-filters.ts` (`schemaFilters`, `noFilters`, `tagsOf`,
  `nodeTags`, `groupTags`, `pressedIn`).
- **Log** → `log.tsx`, `log-rows.tsx` (`Row`, `SortHeading`, sorting), `log-timeline.tsx`,
  `log-filters.tsx` (`FilterBar`, `UserEventFilter`, `SettingBox`, `FilterToggle`, `logFilters`,
  `matches`), `entry-pane.tsx` (`EntryPane`, `EntryView`, `Ranges`, `Values`, `Section`),
  `row-menu.tsx` (`RowMenu`, `rowText`), `log-format.ts` (`clock`, `ms`, `pad`, `slow`, `isSlow`,
  flags).
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

## Phase 4: the tab registry, `dom`, guides as markdown

### Tab registry

- `tabs/tabs.ts`: `export const TABS = [{id: "structure", label: "Structure"}, …] as const`
  (the one `as const` this needs: a literal tuple, not a cast) and `export type Tab = (typeof
  TABS)[number]["id"]`, `isTab`. It replaces `VIEWS` and `isView` in `store.ts`, `TAB_ORDER` in
  `guides.ts` and the `View` type. No React and no imports, so `scripts/readme.ts` and
  `scripts/screenshots.ts` import it under Node.
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

Add the import rules from [Target layout](#target-layout). "A tab doesn't import another tab"
needs a group match: `from: {path: "^packages/panel/src/tabs/([^/]+)/"}`, `to: {path:
"^packages/panel/src/tabs/", pathNot: "^packages/panel/src/tabs/$1/"}`.

## Phase 5: nanostores

Dependencies: `nanostores`, `@nanostores/react`, `@nanostores/persistent` (devDependencies of the
panel, as React is: the build bundles them; CONTRIBUTING asks new runtime dependencies to be
justified, this is about 1 kB).

What changes:

- **Persistence.** `stored.ts` and the six try/catch `localStorage` pairs (panel layout in the
  store, the dock layout, split-pane sizes, the Log's record settings, the Fields tab's last field,
  the theme's local storage) become persistent atoms (`persistentAtom` / `persistentMap` with
  `encode`/`decode`), each `decode` validating and falling back as `read` does now.
  - **Verify first:** that `@nanostores/persistent` survives blocked storage (a sandboxed iframe or
    a browser setting where touching `localStorage` throws). If it doesn't, `stores/persistent.ts`
    sets a guarded engine (`setPersistentEngine`, with try/catch around each access; in-memory
    when blocked). The current behaviour (the value lasts until reload) has to hold. Add a test
    with a `localStorage` that throws.
  - New behaviour: persistent atoms follow `storage` events, so two tabs on the same origin share
    filters live. Fine for a developer tool.
  - Storage keys and stored JSON shapes stay the same, except the panel layout's `view` → `tab`
    (phase 4).
- **The panel store.** `PanelState` becomes a `map`, read with `useStore`. The four
  `onXChanged` listener sets and the reveal slots (below) stay as plain events: they're
  notifications, not state. The request versioning (`run`, `selectionRun`), the per-frame
  coalescing and `start`/`pause` stay as they are.
- **Theme.** The theme store becomes a `computed` over the choice atom and the source; the lazy
  start and stop of the source (`stopSource`) becomes `onMount`. `ThemeStore`, `ThemeSource` and
  `ThemeStorage` keep their exported shapes: the extension passes its own async storage and
  DevTools theme source.
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

## Phase 6: deduplicate

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
5. **`createPromiseCache(fetch, size = 32)`** for the three caches with `KEPT = 32` (node
   details, field details and changes, log entries).
6. **The store's events and reveals.** Four `onXChanged` + four listener sets → `on(event,
   listener)`. Four `showX`/`takeXReveal` pairs + `onReveal` → `reveal(tab, editorId, target)` /
   `takeReveal(tab, editorId)`, with the target type looked up per tab. Keep it only if the
   per-tab target types stay readable.
7. **Fire-and-forget sends.** About 30 `transport.send(…).catch(() => {})` → `store.fire(request)`.
8. **Highlight in the page.** The `outlined` ref and highlight callback in Structure, State and
   DOM → one helper.
9. **`<ExpandCollapse onExpand onCollapse>`** in Structure, State and DOM.
10. **`<Toolbar>`** for the strip under the tab bar (11 copies of `border-b bg-strip px-2 …`), if
    the variants (fixed height or wrapping, `text-xs` or `font-sans`) fit in one or two props. If
    they don't, skip it.
11. **Schema's three sections** (nodes, marks, groups): copy-pasted JSX → one `SchemaSection` fed
    by a small config per kind.
12. **`InspectSection`**: the Log's and the Selection's `Section` (a focusable card with a
    "Log / Copy JSON" context menu) are the same component, give or take `fixed`, `code` and
    "Clear".
13. **`ChoiceMenu`'s radio group** reused by the Dock's `ReopenSettings`.
14. **Small helpers to `lib/`**: `toggled` (Log, Schema), `includes`/`matches` (search, Schema),
    `pathOf` (four versions: detail-cache, node-menu, DOM, Structure's `pathOfItem`).
15. **`ContextMenuItem className="text-xs"`** (28 times): make `text-xs` the item's default in
    `components/ui/context-menu.tsx` (our copy) and drop it at the call sites. Do the same in
    `dropdown-menu.tsx` if its call sites all set it too.
16. **Maybe:** State and DOM both implement a virtualized, collapsible tree with keyboard
    navigation. A shared `useTreeNav` only if it doesn't need many parameters; the likely outcome is
    to leave them separate.

## Phase 7: shadcn

Add each with `npx shadcn add <name>` (from `packages/panel`), then rewrite its icon imports to
`#icons` (adding any icon it needs to `icons/heroicons.tsx`, from Heroicons 16/solid) and check
it renders inside the shadow root (popups through `PortalContainer`).

- **Toggle**: Schema's `Toggle` and the Log's `FilterToggle` → shadcn `toggle` (Base UI's,
  `aria-pressed` handled), with a size and variant for the dense filter chips (h-5, `text-xs`).
  Schema's "order: schema | rank" → `toggle-group` (single). The three section switches
  (nodes / marks / groups) → `toggle`s.
- **Checkbox**: the Log's record settings (`SettingBox`) and the user-event filter's checkboxes →
  shadcn `checkbox`, with its label.
- **Input group**: the search box's count and previous/next buttons, and the Selection tab's
  "Resolve [pos]", as `input-group` addons. The `<input>`s themselves stay plain and unstyled
  (decision 7). **Open to the user:** if they meant no input group around the searches either,
  this item is the Resolve field only.
- **Collapsible**: the Schema sections (`Heading`'s title button and the stretch after the filters
  toggle the section) and the Fields history items (a chevron that opens the change's value). Not
  the Structure, State and DOM trees: their items carry `role="treeitem"` and `aria-expanded`
  themselves, and collapsible's trigger and panel would fight the tree semantics.
- `components.json` keeps `iconLibrary` as is (shadcn has no heroicons option); the icon rewrite
  above is the fix, written in a comment at the top of `components/ui/LICENSE.md` or `CLAUDE.md`
  so the next `shadcn add` gets it too.

## Phase 8: docs

- `CLAUDE.md`: the layout lines for the panel, and "guides are markdown in
  `packages/panel/src/guides/`".
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

## Open points

- Prettier style: the repo's majority style (assumed) or `../react-wordgard`'s.
- Input group around the search boxes, or only around "Resolve" (phase 7).
- `.gitattributes` / line endings (phase 1).
