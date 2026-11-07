# Extension details

The selected row: what it is, and its value in the current state.

- `now`: a field's value, as [`state.field`](https://wordgard.net/docs/ref/#state.GardState.field) reads it.
- `resolved`: what Wordgard combined from a facet's values, as [`state.facet`](https://wordgard.net/docs/ref/#state.GardState.facet) reads it, on the facet's first row.
- Order: the facet's values in the order Wordgard gives them, and what that order does for this facet (for a [paste handler](https://wordgard.net/docs/ref/#editor.Wordgard.pasteHandler), the first returning true handles the paste).
- A [point](https://wordgard.net/docs/ref/#editor.Decoration.Point.source) or [range](https://wordgard.net/docs/ref/#editor.Decoration.Range.source) decoration source lists its decorations, each a link to the Structure.

## Tips

- Click a value under Order to select its row.
- Press Escape or click the close button to close the details; double-click a row, or click the + button, to open them again.
