## Unreleased

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
