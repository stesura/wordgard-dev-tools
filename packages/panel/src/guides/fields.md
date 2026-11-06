# Fields

Each [`GardState.Field`](https://wordgard.net/docs/ref/#state.GardState.Field): fields store additional information in an editor state, and keep it in sync with the rest of the state. Its value, and the changes seen to it, each linked to its transaction in the Log.

- Changes are tracked while this tab is shown, or while the Log records.
- Unnamed fields show as "field #n": name them with `wordgardDevtools({fields: {name: field}})`.
- Expand a change to see the value it set; right-click it to log or copy it.
