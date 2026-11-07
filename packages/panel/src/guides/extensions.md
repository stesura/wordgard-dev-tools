# Extensions

The editor's [configuration](https://wordgard.net/docs/ref/#state.GardState.Extension), nested as the app wrote it: arrays, [precedence](https://wordgard.net/docs/ref/#state.GardState.prec), [compartments](https://wordgard.net/docs/ref/#state.GardState.Compartment), [state fields](https://wordgard.net/docs/ref/#state.GardState.Field) and [facet](https://wordgard.net/docs/ref/#state.GardState.Facet) values, and objects carrying an `extension`.

- Each row says the precedence it applies at: a precedence wrapper sets it for what it holds; what a field provides inherits the field's; what a facet enables applies at default precedence.
- Wordgard keeps one occurrence of an extension used twice: the one at the highest precedence, the first among equals. The others show as `duplicate`.
- A compartment shows its current content: what a reconfigure put there, if any.
- Facets have no names: those Wordgard exports are named (`Wordgard.updateListener`, `Decoration.Point.source`), the others numbered (`facet #n`), Wordgard's own internal ones among them.
- When the editor's text direction disagrees with the state's, Wordgard adds a compartment of its own, at highest precedence, holding `GardState.textLTR`.

## Tips

- Select a row to see its value now: a field's, or the resolved value of a facet Wordgard exports (on its first row).
- Log a row to the console to jump to its definition; log a facet's value to see what Wordgard combined.
- Show a field in the Fields tab; a decoration source lists its decorations, each a link to the Structure.
- Name unnamed fields with `wordgardDevtools({fields: {name: field}})`.
- Key bindings lists the editor's [key bindings](https://wordgard.net/docs/ref/#editor.KeyBinding) in the order Wordgard tries them, the default keymap last; search by key, command or description, and log a command to jump to it.
