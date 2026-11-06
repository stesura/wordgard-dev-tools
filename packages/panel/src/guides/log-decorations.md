# Decorations in the Log

What each [flush](https://wordgard.net/docs/ref/#editor.Wordgard.flush) did to the [decoration sources](https://wordgard.net/docs/ref/#editor.Decoration.Point.source): the editor calls every source once per flush, not per transaction, and compares what it returns with the sets it last drew. Each source's set is compared from the flush's first state to its last, over the changes of all its transactions.

- `same set`: the same object, nothing it holds moved. `kept, not mapped` (`stale` on the row): the same set kept across a change that moved what it holds; fine only when its positions aren't the document's.
- `updated`: a new set sharing values with the old one, by identity (a `map`, a `modify`, or a rebuild from the same values); `recreated`: sharing none.
- The editor compares only where the changes left the document untouched, by each value's `eq`: "redrawn" lists those places. What the changes replaced is redrawn anyway.
- `wasted` (`↻ 0` on the row): a new set the editor can't tell from the old one mapped, rebuilt where nothing changed. Rebuilding what a change touched (as `decoratePlots` does) isn't counted, nor is Wordgard's own node selection source, which rebuilds its one point on each call.
- While typing, a set rebuilt from the same values can't be told from a mapped one: only a flush that changes no document shows that rebuild as wasted.
- A source whose function changed (a reconfigure, a re-run extension) is matched to the old one by its place: the editor tells sources apart by function, so it redraws both sets whole.
- The time is a call of the source on the flush's last state, made when shown, not when the editor ran it; a source backed by a state field is fast here, its work done in the field's update.
- Sources are called again on old states: one reading anything outside the state (a variable, the editor, the DOM) answers for today, not for that flush. Sources backed by state fields are exact.
- When the editor's own decoration facets change, it redraws everything; that isn't shown.

## Tips

- Switch Decorations on to flag every flush; off, only the selected transaction's flush is checked.
- Filter on `wasted` or `stale`: rows whose flush isn't checked yet stay shown.
- Click a redrawn position to see it in the Structure, with decorations on, while the flush's document is the editor's.
- Right-click the Decorations section to log each source's sets before and after the flush.
