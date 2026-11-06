# State

The [editor state](https://wordgard.net/docs/ref/#state.GardState) as collapsible JSON: [`GardState.toJSON()`](https://wordgard.net/docs/ref/#state.GardState.toJSON), with the named fields that serialise. The state tracks the current document, the selection, the configuration of the editor, and any extra state defined by extensions.

- Right-click a line to highlight its node in the editor, show it in the Structure, log it (live or as JSON), or copy its JSON or path.
- The toolbar logs the whole state, live or as JSON.
- Download the state as a JSON file, or replace it from one: the file is checked against the schema first, and the replacement can be undone. Fields aren't restored.
- Name your [fields](https://wordgard.net/docs/ref/#state.GardState.Field) with `wordgardDevtools({fields: {name: field}})` to see them here.
