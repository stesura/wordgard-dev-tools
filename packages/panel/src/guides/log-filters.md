# Filters

Which [transactions](https://wordgard.net/docs/ref/#state.Transaction) the Log shows: by [user event](https://wordgard.net/docs/ref/#state.Transaction.userEvent), by what each changed, by [annotation](https://wordgard.net/docs/ref/#state.Transaction.Annotation).

- `doc`: [changed the document](https://wordgard.net/docs/ref/#state.Transaction.docChanged).
- `sel`: [set the selection](https://wordgard.net/docs/ref/#state.Transaction.selection) explicitly; a selection only mapped through the changes doesn't count.
- `focus`: created because the editor's [focused status changed](https://wordgard.net/docs/ref/#editor.Wordgard.isFocusChange).
- `app`: [created by a transaction appender](https://wordgard.net/docs/ref/#state.Transaction.appended).

## Tips

- Switch a changed flag off to hide the rows where only it changed; a row that also changed something still on stays.
- Untick user events to hide their rows; switch an annotation on to show only the rows that have it.
