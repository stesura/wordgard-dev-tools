# Log

Recorded [transactions](https://wordgard.net/docs/ref/#state.Transaction). For each: what it changed, its selection, [effects](https://wordgard.net/docs/ref/#state.Transaction.Effect) and [annotations](https://wordgard.net/docs/ref/#state.Transaction.Annotation), and how long its [dispatch](https://wordgard.net/docs/ref/#editor.Wordgard.dispatch) and [flush](https://wordgard.net/docs/ref/#editor.Wordgard.flush) took.

- Typically, a user action creates a single transaction, which may contain any number of document changes, may change the selection, or have other effects.
- [userEvent](https://wordgard.net/docs/ref/#state.Transaction.userEvent): a string identifying the user interface event, dot-separated (`input.type`, `select.pointer`).
- Updates over 16 ms, a frame, are flagged.

## Tips

- Press Record, then use the editor.
- Filter by user event, what changed or annotation; sort by any timing column.
- Right-click a row to log the transaction or copy it as JSON or text; right-click a part of its detail to log or copy that part.
- Untick record select.pointer to leave out selections made with the pointer, and record focus to leave out focus changes.
