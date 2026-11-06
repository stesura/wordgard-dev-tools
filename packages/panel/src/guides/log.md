# Log

Recorded [transactions](https://wordgard.net/docs/ref/#state.Transaction). Typically, a user action creates a single transaction, which may contain any number of document changes, may change the selection, or have other effects. For each: what it changed, its selection, [effects](https://wordgard.net/docs/ref/#state.Transaction.Effect) and [annotations](https://wordgard.net/docs/ref/#state.Transaction.Annotation), and how long its [dispatch](https://wordgard.net/docs/ref/#editor.Wordgard.dispatch) and [flush](https://wordgard.net/docs/ref/#editor.Wordgard.flush) took.

- Press Record, then use the editor. Updates over 16 ms are flagged.
- [userEvent](https://wordgard.net/docs/ref/#state.Transaction.userEvent): a string identifying the user interface event, dot-separated (`input.type`, `select.pointer`).
- changed: `doc`, `sel`; `focus`, the editor's [focused status changed](https://wordgard.net/docs/ref/#editor.Wordgard.isFocusChange); `app`, [created by a transaction appender](https://wordgard.net/docs/ref/#state.Transaction.appended).
- Filter by user event, what changed or annotation; sort by any timing column.
- Right-click a row to log the transaction or copy it as JSON or text; right-click a part of its detail to log or copy that part.
- Untick record select.pointer to leave out selections made with the pointer, and record focus to leave out focus changes.
