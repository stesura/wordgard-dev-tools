# Extensions

The editor's [configuration](https://wordgard.net/docs/ref/#state.GardState.Extension) as Wordgard resolves it: what it keeps, at which [precedence](https://wordgard.net/docs/ref/#state.GardState.prec), and in which order each [facet](https://wordgard.net/docs/ref/#state.GardState.Facet) gets its values.

- Extensions: the configuration, nested as the app wrote it.
- Details: the selected extension, its value in the current state, and its place among its facet's values.
- Key bindings: the editor's [key bindings](https://wordgard.net/docs/ref/#editor.KeyBinding), in the order Wordgard tries them.

## Tips

- Click a row to select it; double-click it, or click the + button, to open its details.
- Click the keyboard button to open the key bindings.
- Click "By facet" to list each facet with its values in the order Wordgard gives them.
- Name what shows as `facet #n` or `compartment #n` with `wordgardDevtools({names: {name: value}})`, or a plain `{name: "spellcheck", extension}` object.
- Right-click a row, the details or a key binding (or Shift+F10) to log it to the console, show it in Fields or copy it.
