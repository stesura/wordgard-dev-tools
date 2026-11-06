# Resolved positions

[Positions](https://wordgard.net/docs/ref/#h-resolved-positions) in a Wordgard document are offset numbers. On its own, such a number doesn't tell you much about its context: [`doc.resolve(pos)`](https://wordgard.net/docs/ref/#doc.Plot.Doc.resolve) returns a [`Pos`](https://wordgard.net/docs/ref/#doc.Pos), which describes a position in a node, plus that node's parents.

- Anchor and head are the selection's two ends; an empty selection shows one, the cursor.
- [parent](https://wordgard.net/docs/ref/#doc.Pos.parent): the plot that the position points into. [depth](https://wordgard.net/docs/ref/#doc.Pos.depth): the amount of plots that wrap it, not counting the document.
- [index](https://wordgard.net/docs/ref/#doc.Pos.index): the index into its parent's content array. Text nodes don't count as parent plots: inside one, [inText](https://wordgard.net/docs/ref/#doc.Pos.inText) is the offset into the text node, and index is the text node's.
- Type a number in Resolve to see any position; Escape clears it.
- Right-click a card to log the live `Pos` or copy its JSON.
