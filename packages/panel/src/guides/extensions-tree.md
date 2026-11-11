# Extensions

The configuration nested as the app wrote it: arrays, [precedence](https://wordgard.net/docs/ref/#state.GardState.prec), [compartments](https://wordgard.net/docs/ref/#state.GardState.Compartment), [state fields](https://wordgard.net/docs/ref/#state.GardState.Field), [facet](https://wordgard.net/docs/ref/#state.GardState.Facet) values and objects carrying an `extension`.

- A row's tag is the precedence it applies at. What a field [provides](https://wordgard.net/docs/ref/#state.GardState.Field.Spec.provide) inherits the field's; what a facet [enables](https://wordgard.net/docs/ref/#state.GardState.Facet.Spec.enables) applies at default.
- `duplicate`: Wordgard keeps one occurrence of an extension, the highest precedence, the first among equals.
- `#2 of 5`: a value's place in its facet, highest precedence first, then configuration order.
- A compartment shows its current content, after any [reconfigure](https://wordgard.net/docs/ref/#state.GardState.Compartment.reconfigure).
- Facets Wordgard exports show its names for them (`Wordgard.updateListener`); others their [debug name](https://wordgard.net/docs/ref/#state.GardState.Facet.Spec.name); unnamed ones are numbered.
- A compartment of Wordgard's own, at highest, holding [`GardState.textLTR`](https://wordgard.net/docs/ref/#state.GardState.textLTR): it aligns the state's text direction with the editor's.

## Tips

- Click "By facet" to list each facet with its values in the order Wordgard gives them; click it again for the tree.
- Double-click a row to open its details.
