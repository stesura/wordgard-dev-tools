# Selection

The editor's [selection](https://wordgard.net/docs/ref/#state.GardState.selection). Its [anchor](https://wordgard.net/docs/ref/#state.GardSelection.anchor) stays put when it is extended (with Shift and an arrow, say); its [head](https://wordgard.net/docs/ref/#state.GardSelection.head) moves. `from` and `to` are its lower and upper ends; it is [empty](https://wordgard.net/docs/ref/#state.GardSelection.empty) when anchor and head meet.

- A [text selection](https://wordgard.net/docs/ref/#state.GardSelection.Text) covers one range of the document.
- A [node selection](https://wordgard.net/docs/ref/#state.GardSelection.Node) covers one node, for example a clicked leaf.
- A [cell selection](https://wordgard.net/docs/ref/#table.CellSelection) covers a rectangle of cells in one table. anchorCell, headCell: the positions directly in front of its [anchor](https://wordgard.net/docs/ref/#table.CellSelection.anchorCell) and [head](https://wordgard.net/docs/ref/#table.CellSelection.headCell) cells. Cell selections can have multiple ranges.
- [`activeMarks`](https://wordgard.net/docs/ref/#state.GardSelection.Resolved.activeMarks): the active marks for this selection, i.e. the marks that will be applied on the next keystroke.

## Tips

- Right-click the card and log it to the console to see the full selection object.
