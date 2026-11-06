# Fields

Each [`GardState.Field`](https://wordgard.net/docs/ref/#state.GardState.Field): fields store additional information in an editor state, and keep it in sync with the rest of the state. Its value, and the changes seen to it, each linked to its transaction in the Log.

- Changes are tracked while this tab is shown, or while the Log records.
- Unnamed fields show as "field #n": name them with `wordgardDevtools({fields: {name: field}})`.
- Expand a change to see the value it set; right-click it to log or copy it.
- A field holding a [`PointSet` or `RangeSet`](https://wordgard.net/docs/ref/#set) shows its entries; click a position to show its node in the Structure.
- Each change to a set is badged: "updated +a −d" (a new set sharing entries with the old: mapped, modified or rebuilt from the same values), "recreated" (sharing none), and amber "kept, not mapped": the same set kept across a change that moved or removed what it holds, usually a field that forgot `set.map(tr.changes)`. Fine only if its positions aren't the document's, or are mapped where they're read.
- Expanding a set change lists what it added and dropped; added entries link to their nodes while the document hasn't changed since.
