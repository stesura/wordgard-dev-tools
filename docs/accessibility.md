# Accessibility

The panel aims at WCAG 2.2 AA, within what a dense developer tool allows. These are the
conventions new code keeps to, and what is left to do.

## Keyboard

Every tab works without a mouse: one Tab stop per list, arrows inside it.

| Where                       | Keys                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Any search box              | Ctrl+F (Cmd+F) from anywhere in the tab; Enter / Shift+Enter step through matches; Escape clears.                                       |
| Any list with a menu        | Shift+F10 or the Menu key.                                                                                                              |
| Structure, DOM, State trees | ↑ ↓, → opens / first child, ← closes / parent, Home End. Structure: Enter scrolls to the node, Escape clears. State: Ctrl+A, Ctrl+C.    |
| Schema cards                | Tab or ↑ ↓ between cards, Home End; → ← through a card's links; Enter shows the JSON, Escape closes it.                                 |
| Extensions                  | The tree as above. Key bindings: one Tab stop, ↑ ↓ Home End pick a row, Enter opens its menu, Escape closes (focus back on its button). |
| Log                         | ↑ ↓ Home End. "Show #N in Log" focuses the list.                                                                                        |
| Fields                      | List: ↑ ↓ Home End. History (a tree): ↑ ↓ Home End; Enter or Space toggles; → opens then steps through links, ← back then closes.       |

- Trees follow the [WAI-ARIA tree pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/).
  Virtualized lists (DOM, State, Log) keep focus on the list with `aria-activedescendant` and give
  items `aria-posinset`/`aria-setsize` (`withSiblings`, `lib/siblings.ts`); Structure and Schema
  cards use a roving `tabIndex`.
- Selection follows focus. Focus never falls to `<body>`: closing something moves it to what's left.
- Chevrons are mouse-only: `tabIndex={-1}`, `aria-hidden` where `aria-expanded` says it,
  `mousedown` prevented.
- Tooltip details have a keyboard route (decoration badges and widgets: the node pane).
- A control that switches views keeps its place, so focus stays on it.

## Focus, selection, contrast

- `--ring` is the primary colour, about 17:1. Selection: `ring-2 ring-ring` or a 3px left bar
  (`shadow-[inset_3px_0_0_var(--color-ring)]`). Focus: an outline
  (`focus-visible:outline-2 focus-visible:outline-offset-2`). `bg-accent` (1.1:1) is never the
  only sign.
- Pressed toggles (`aria-pressed`): a 2px underline besides the tint.
- Search inputs: no ring, an underline grows from the centre (`SearchInput`).
- Text 4.5:1, controls 3:1. `--muted-foreground` is 0.5 light / 0.76 dark (5:1+); empty checkbox
  border `border-muted-foreground`; type colours (`lib/colours.ts`) 4.5:1 in both themes.
- Nested tints are opaque (`color-mix(in oklab, var(--primary) 5%, var(--background))`):
  translucent ones add up.
- Not by colour alone: slow timings get a warning sign, bold and ", slow"; the current match a 2px
  outline; the timeline's selected bar a mark; decorated text a dotted underline.

## Forced colours

Shadows and backgrounds drop out; an unlayered block at the end of `styles.css` replaces them:
`CanvasText` outline for focus, `Highlight` outline for selection, double/dashed `Highlight`
outlines for current/other matches (`search-current`, `search-match`), `Highlight` +
`HighlightText` for pressed toggles. Use `outline-none`, never `outline-hidden` (it outlines in
forced colours). Meaningful backgrounds set a system colour (`forced-colors:bg-[CanvasText]`).

## Targets

24px: toolbar buttons (`size="icon-xs"`), DOM/State/Log rows, their chevrons. Small elements keep
their look and get a `before:` hit area where nothing else sits in it (Structure chevrons, the
selection bar's type links via `TypeLink`'s `target24`).

## Motion and timing

- Messages stay until closed or the tab, panel or editor changes.
- `prefers-reduced-motion`: `motion-reduce:` on the panel's animations; a rule at the end of
  `styles.css` cuts shadcn's zoom/slide/blur to a fade. Colour changes stay.
- Test with CDP `Emulation.setEmulatedMedia` (`test/media.test.ts`) or Playwright
  `newContext({ forcedColors: "active" })`.

## Screen readers

- Icon buttons have a label (`IconButton` or `aria-label`), shown as a tooltip.
- Schema cards: `article` + `h4`, fields a `dl`, tags a list; links read "Text node type".
- Section bars named by title with `aria-expanded`; counts read "9 nodes".
- Live results: `role="status"` / `role="alert"`, close button outside (`NoticeBar`).
- Glyphs hidden and named in words ("◇ 2" reads "2 decorations").

## To do

- **Guides**: a Keyboard section in each tab's guide (Shift+F10 is only in Extensions and Key
  bindings so far).
- **axe-core** scan of every tab, light and dark, in the browser tests.
- **Not yet reviewed**: Selection tab, Log filters and entry pane, the panel's own controls (dock,
  resize, editor picker, settings).
- **Targets under 24px**: `TypeLink` in the node pane and the Selection cards (16px rows need
  spacing first).
- **Text size**: px sizes ignore the browser default; add a text size setting.
- **`prefers-contrast: more`**: a stronger theme.
- **Extension**: check Ctrl+F reaches the panel inside DevTools.
