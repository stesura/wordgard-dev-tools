# Selection bar

The selected editor's [selection](https://wordgard.net/docs/ref/#state.GardSelection), always shown, whichever tab is open. Its [anchor](https://wordgard.net/docs/ref/#state.GardSelection.anchor) is the side that doesn't move when you extend it; its [head](https://wordgard.net/docs/ref/#state.GardSelection.head) is moved when it is extended. It is [empty](https://wordgard.net/docs/ref/#state.GardSelection.empty) when anchor and head are at the same position.

- type: [`text`](https://wordgard.net/docs/ref/#state.GardSelection.Text) (a single range; a cursor when empty) or [`node`](https://wordgard.net/docs/ref/#state.GardSelection.Node) (a single node).
- marks: the [active marks](https://wordgard.net/docs/ref/#state.GardSelection.Resolved.activeMarks), those that should be applied to content inserted at the selection. (stored): the cursor's [own](https://wordgard.net/docs/ref/#state.GardSelection.Text.marks), from toggling an inline style.
- Selection opens the Selection tab, with all of it. The buttons show the node holding the head in the Structure, log the selection to the page's console, or copy its JSON.
