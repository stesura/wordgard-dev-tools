# Mark types

Each [mark](https://wordgard.net/docs/ref/#doc.Mark) type, defined by a [`Mark.Spec`](https://wordgard.net/docs/ref/#doc.Mark.Spec): what it adds to the nodes it's on, where it may go, and how it nests with others.

- [`inclusive`](https://wordgard.net/docs/ref/#doc.Mark.Spec.inclusive): active when the cursor is positioned at its end (or at its start when that is also the start of the parent node). Defaults to true.
- [`spanning`](https://wordgard.net/docs/ref/#doc.Mark.Spec.spanning): can span across multiple nodes, rather than referring to an individual node. Only spanning marks can be added to text.
- [`element`](https://wordgard.net/docs/ref/#doc.Mark.Type.isElement): rendered with an element (its [shape](https://wordgard.net/docs/ref/#doc.Mark.Spec.shape)), not as attributes. Spanning element marks can be drawn as elements containing multiple nodes.
- [`rank`](https://wordgard.net/docs/ref/#doc.Mark.Spec.rank): its position relative to other marks. Lower ranks appear first in mark sets and are rendered around higher ranks. Defaults to 100.
- [`keepOnSplit`](https://wordgard.net/docs/ref/#doc.Mark.Spec.keepOnSplit), [`keepOnTypeChange`](https://wordgard.net/docs/ref/#doc.Mark.Spec.keepOnTypeChange): whether it's kept when its node is split, or changes type.
- goes on: the node types it may go on ([`target`](https://wordgard.net/docs/ref/#doc.Mark.Spec.target), as the schema resolves it).

## Tips

- Order by rank to see how marks nest.
- Double-click a card for its JSON.
