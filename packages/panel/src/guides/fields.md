# Fields

Each [`GardState.Field`](https://wordgard.net/docs/ref/#state.GardState.Field): its value, and the changes seen to it, each linked to its transaction in the Log.

- Fields store additional information in an editor state, and keep it in sync with the rest of the state.
- Changes are tracked while this tab is shown, or while the Log records.

## Tips

- Name unnamed fields ("field #n") with `wordgardDevtools({fields: {name: field}})`.
- Expand a change to see its value; right-click to log or copy it.
- For a [`PointSet` or `RangeSet`](https://wordgard.net/docs/ref/#set), click a position to show its node in the Structure.
- Amber "kept, not mapped": the set wasn't mapped through a change that moved it; usually a missing `set.map(tr.changes)`.
- Expand a set change to see what it added and dropped.
