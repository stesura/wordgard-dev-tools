## Unreleased

### Breaking changes

Requires `wordgard` ~0.7.0 (0.7.x): each Wordgard minor release, which may break its API, needs a devtools release.

`mountDevtools()` returns `host` as `HTMLElement | null`: it is `null` where there is no DOM (server rendering). In a browser it is always the element, as before.

### New features

The panel shows the debug names Wordgard 0.7 adds: of state fields and derived fields, facets, compartments, node groups and roles, effects and annotations. Unnamed ones are still numbered; the `fields` and `names` options override debug names.

The Log names a transaction's effects by their debug names, not just "effect", and saves annotation filters for named annotations.

### Bug fixes

`mountDevtools()` mounts at most one panel per page: while one is mounted, later calls return handles to it, and the panel is removed when every handle has been unmounted. A page that called it from a React effect without returning `unmount` got two panels in development, where Strict Mode runs effects twice.

The DOM tab marks widgets as chrome again: Wordgard 0.7 no longer makes them uneditable, so an element is now chrome when it draws no node and holds none of the document's text.

`mountDevtools()` no longer throws during server rendering (Next.js, Remix): without a DOM it does nothing. Called before the page's body exists (a script in `<head>`), it mounts once the body is there.

Keys typed in the panel docked in the page no longer reach the page's own keyboard shortcuts. Escape still does, so the panel's menus close on it.

The extension takes a reply only from the frame it asked: a frame of the page could answer a request sent to another frame's editor.

## 0.1.2 (2026-11-07)

### Bug fixes

The packages' links, and the panel's link to the project, point to the renamed repository, github.com/stesura/wordgard-dev-tools.

## 0.1.1 (2026-11-07)

### Bug fixes

The panel docked in the page draws its focus and selection rings, and its menus' borders and shadows, again: the published build wrote a ring's default offset as a bare `0`, which made every ring and shadow invalid inside the panel's shadow root.

## 0.1.0 (2026-11-07)

### New features

First release: `@stesura/wordgard-dev-tools` registers Wordgard editors with the `wordgardDevtools()` plugin and answers the panel, and `@stesura/wordgard-dev-tools-panel` docks the panel in the page with `mountDevtools()`.

Requires `wordgard` >=0.6.2 <1. Both packages are released together, at one version.

The panel lists every connected editor on the page, iframes included, and finds a node by clicking it in the page, without moving the caret.

Its tabs show the document's structure, the selection, the state, the rendered DOM, the schema, the state fields, the extensions as Wordgard resolves them, and a log of transactions and decoration flushes with their timing.

The Extensions tab lists each facet's values in the order Wordgard gives them, by precedence, and names facets, compartments and other extensions from the `names` option or a `{name, extension}` object.

A recorded log copies as a Node script that replays it on plain Wordgard.

In production builds both calls do nothing unless `enabled` is set, and the panel downloads nothing.

The panel package ships an Agent Skill, `skills/wordgard-devtools/SKILL.md`, for coding agents setting up the devtools.
