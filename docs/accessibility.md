# Accessibility

The panel aims at WCAG 2.2 AA, within what a dense developer tool allows. This page records the
conventions the panel follows, so new code keeps to them, and what is still to do.

## Keyboard

Every tab can be used without a mouse. One Tab stop per list; the arrows move inside it.

| Where                       | Keys                                                                                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any tab with a search box   | Ctrl+F (Cmd+F) goes to the search, from anywhere in the tab. Enter and Shift+Enter step through the matches; Escape clears.                                                                                                                                          |
| Any list with a menu        | Shift+F10 or the Menu key opens the focused item's context menu.                                                                                                                                                                                                     |
| Structure, DOM, State trees | ↑ ↓ previous and next visible item; → opens, or goes to the first child; ← closes, or goes to the parent; Home and End. Structure: Enter scrolls the node into view in the editor, Escape clears the selection. State: Ctrl+A, Ctrl+C.                               |
| Schema cards                | Tab and ↑ ↓ go from card to card, across the sections; Home and End; → and ← move through a card's links and tags; Enter on a card shows its JSON; Escape closes the JSON (in the filter: clears it first).                                                          |
| Extensions                  | The tree: as the trees above; Escape clears the selection. Tab to the pane for its menu. Key bindings pane: one Tab stop in the table, ↑ ↓ Home End select a row, Enter opens its menu; Escape closes it (in the search: clears it first), focus back on its button. |
| Log                         | ↑ ↓ between transactions, Home and End. A jump to the Log ("Show #N in Log") focuses the list.                                                                                                                                                                       |
| Fields                      | The list: ↑ ↓ Home End pick a field. The history (a tree): ↑ ↓ Home End between changes; Enter or Space opens and closes one; → opens it, then steps through its links; ← steps back, then closes. Tab to the value for its menu.                                    |

- Trees follow the [WAI-ARIA tree pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/).
  Virtualized lists (DOM, State, Log) keep focus on the list and point at the active row with
  `aria-activedescendant`; the Structure and the Schema cards are real elements, with a roving
  `tabIndex`.
- The selection follows focus: moving with the keys does what a click does (the node pane, the
  outline in the page).
- Focus is never left on `<body>`: closing a pane, a banner or a box moves it to what's left (the
  selected card, the list, the box).
- An expand/collapse chevron is for the mouse: `tabIndex={-1}`, `aria-hidden` where the item's
  `aria-expanded` says it (Structure, DOM, State), and `mousedown` prevented: a click leaves focus
  on the tree, never on the hidden button.
- A tooltip is the mouse's way to a detail; the keyboard has another. The Structure's decoration
  badges and widgets: the node pane lists the selected node's decorations and the widgets in it.

## Focus and selection

- `--ring` is the primary colour (near black, near white in dark): about 17:1 on the background.
- Focus and selection look different. Selection: a `ring-2 ring-ring`, or a 3px bar on the left of
  a row (`shadow-[inset_3px_0_0_var(--color-ring)]`, 5px under a search match's outline). Focus:
  an outline (`focus-visible:outline-2 focus-visible:outline-offset-2 …`), so focus on a card
  shows apart from focus on a link inside it.
- A selected row's `bg-accent` is 1.1:1 on the background: never the only sign of the selection.
- Pressed text toggles (`aria-pressed`: the Log's Decorations, the Extensions view switch): a 2px
  bar under them besides the tint (`aria-pressed:shadow-[inset_0_-2px_0_var(--color-ring)]`). The
  Structure's Decorations: the decorations' gradient and a check.
- Virtualized trees give each item `aria-posinset` and `aria-setsize` (not every row is in the DOM):
  `withSiblings` in `lib/siblings.ts`. The State's closing brackets aren't counted (an object's
  keys are its children); each takes its opening's numbers.
- A control that switches views keeps its place in the toolbar, so React doesn't draw it anew and
  focus stays on it.
- Search inputs have no ring: focus grows an underline from the centre (`SearchInput` in
  `components/search-box.tsx`), at `ring/70`.

## Forced colours (Windows High Contrast)

Forced colours drop box shadows (every `ring-*`) and backgrounds. One block at the end of
`styles.css`, unlayered so it beats `outline-none`, draws in their place:

- focus: a `CanvasText` outline on `:focus-visible`;
- selection: a `Highlight` outline on selected tree items, options and the active tab;
- a selected search match: the selection's colour in the match's style, a 4px double `Highlight`
  outline for the current match, dashed for the others (`matchClass` adds the plain classes
  `search-current` and `search-match` for it);
- pressed chips and toggles (`aria-pressed`, `data-pressed`): `Highlight` with `HighlightText`, not
  adjusted (adjusted, the text would vanish on it).

Use `outline-none`, never `outline-hidden` as a base class: in forced colours, `outline-hidden`
outlines the element all the time. Elements whose background carries meaning set a system colour
(`forced-colors:bg-[CanvasText]` on the Log timeline's bars).

Check with Playwright: `browser.newContext({ forcedColors: "active", colorScheme: "dark" })`.

## Contrast

- Text: 4.5:1. `--muted-foreground` is darker than shadcn's in light (0.5) and lighter in dark
  (0.76): 5:1 or more on background, muted and accent.
- Controls and states: 3:1. The empty checkbox's border is `border-muted-foreground`, not
  `border-input` (1.3:1).
- Tints that nest are opaque: the Structure's boxes holding the editor's selection use
  `color-mix(in oklab, var(--primary) 5%, var(--background))`. A translucent `bg-primary/5` added up
  box in box, and muted text fell to 4.4:1 four levels deep.
- Type colours (`lib/colours.ts`) keep 4.5:1 in both themes.

## Not by colour alone

- Slow timings: a warning sign, bold, and ", slow" for screen readers (`Timing` in
  `tabs/log/log-rows.tsx`), besides the red.
- The current search match: a 2px outline, besides the stronger tint; other matches a dashed outline
  in forced colours.
- The Log timeline's selected bar: a mark under it; slow bars rise above the dashed threshold line.
- The Structure's decorated text: a dotted underline besides the violet tint.

## Targets

- Toolbar buttons: 24px (`size="icon-xs"`).
- DOM, State and Log rows: 24px (the Log's column header too); the DOM's and State's chevron a
  24×24 button around a 12px icon, no padding (`state-row.tsx`, `dom-row.tsx`).
- A small element keeps its look and gets a 24px target from a `before:` pseudo-element: the
  Structure's chevrons (14px icon, `before:-inset-[5px]`, in a 24px-high box header: a box clips
  what overflows it), the selection bar's mark links
  (`TypeLink`'s `target24`, 16px high). Only where nothing else sits inside that area: the selection
  bar spaces its wrapped lines for it.

## Timing and motion

- Messages stay until closed (the State's and the Log's banners have a ×), or until the tab, the
  panel or the editor changes.
- Animations honour `prefers-reduced-motion` where the panel defines them (`motion-reduce:`).
  Menus, popovers, selects and tooltips (shadcn's, through tw-animate-css) only fade then: a rule
  at the end of `styles.css` resets their zoom, slide, turn and blur. Colour changes (the copy
  flash, hover) stay: they don't move.
- Check with CDP: `Emulation.setEmulatedMedia` with `prefers-reduced-motion` or `forced-colors`
  (`test/media.test.ts`).

## Screen readers

- Toolbar icon buttons have a label (`IconButton`, or `aria-label` on `Button`), shown as a tooltip.
- Schema cards are `article`s with an `h4`, their fields a `dl`, their tags a list; links are named
  "Text node type", "Strong mark type".
- Section bars are named by their title ("Nodes"), with `aria-expanded`; counts read "9 nodes".
- Live results: `role="status"` for success, `role="alert"` for errors, with the close button
  outside the live region (`NoticeBar` in `components/notice-bar.tsx`).
- Glyphs are hidden and named in words: the Structure's decoration badge "◇ 2" reads "2
  decorations", a widget's "◆" reads "widget" where it sits; the Log's flush badges likewise.

## To do

- **Guides**: a "Keyboard" section in each tab's guide; Shift+F10 / the Menu key for menus.
- **Automated checks**: an axe-core scan of every tab, light and dark, in the browser tests
  (contrast and ARIA), so regressions are caught. Needs `axe-core` as a dev dependency.
- **Not yet reviewed** for keyboard and screen readers: the Selection tab, the Log tab's filters and
  entry pane, and the panel's own controls (dock, resize, editor picker, settings).
- **Targets under 24px**: type links (`TypeLink`) in the node pane and the Selection tab's cards
  (16px). They sit in rows 16px apart, so a larger hit area would overlap the next row's: the rows
  need spacing first.
- **Text size**: sizes are in px (in-page, rem would follow the host page), so the browser's default
  font size has no effect. A text size setting in the panel's settings would give it back.
- **`prefers-contrast: more`**: a stronger theme (borders, muted text).
- **Extension**: check that Ctrl+F reaches the panel inside DevTools.
