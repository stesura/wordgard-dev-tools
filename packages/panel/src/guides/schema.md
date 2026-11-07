# Schema

The [schema](https://wordgard.net/docs/ref/#h-schema)'s node and mark types and node groups: what each holds, where it can go, its parameter and its spec.

- A schema is a collection of node and mark types, including exactly one document type, plus an optional set of [overrides](https://wordgard.net/docs/ref/#doc.Schema.Override) that modify the relations between those elements.

## Tips

- Filter by name or tag. Collapse a section from its title.
- Type names link between cards. Double-click a card to see its spec as JSON.
- Order marks by rank to see how they nest.
- Each section's guide explains its cards.
- `decorated`: the editor draws the type differently, through [tag decorations](https://wordgard.net/docs/ref/#editor.Decoration.Tag) (a shape, wrappers, widgets, attributes) or [`Decoration.Mark.shape`](https://wordgard.net/docs/ref/#editor.Decoration.Mark.shape); the Effective view lists them. Functions of the node are evaluated on the first node of the type in the document.
