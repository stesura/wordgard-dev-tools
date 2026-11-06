# Node types

Each node type in the schema, defined by a [`Plot.Spec`](https://wordgard.net/docs/ref/#doc.Plot.Spec) or a [`Node.Spec`](https://wordgard.net/docs/ref/#doc.Node.Spec). A [plot](https://wordgard.net/docs/ref/#doc.Plot) delimits part of the document, giving a special meaning to the nodes inside it; a [leaf](https://wordgard.net/docs/ref/#doc.Leaf) is a node with no content nodes (text, images, line breaks).

- `block` or `inline`: [whether this node is an inline or a block node](https://wordgard.net/docs/ref/#doc.Node.Spec.inline). Defaults to block.
- `textblock`: [a block node with inline content](https://wordgard.net/docs/ref/#doc.Plot.isTextblock). `doc`: [the document node](https://wordgard.net/docs/ref/#doc.Plot.Doc).
- [`defining`](https://wordgard.net/docs/ref/#doc.Plot.Spec.defining): preserved (when possible) when its content is duplicated (dragged, pasted, etc) into a new position.
- [`neutral`](https://wordgard.net/docs/ref/#doc.Plot.Spec.neutral): may be completely replaced when its entire content gets replaced. Defaults to `!defining`.
- [`isolating`](https://wordgard.net/docs/ref/#doc.Plot.Spec.isolating): disallows some kinds of editing across its borders (such as backspacing or unwrapping).
- [`canBeEmpty`](https://wordgard.net/docs/ref/#doc.Plot.Spec.canBeEmpty): may be empty. Plots with block content, by default, require at least one child.
- [`preserveWhitespace`](https://wordgard.net/docs/ref/#doc.Plot.Spec.preserveWhitespace): whitespace inside it is preserved. [`row`](https://wordgard.net/docs/ref/#doc.Plot.Spec.orientation): its children sit next to each other, not below each other.
- [`selectable`](https://wordgard.net/docs/ref/#doc.Node.Spec.selectable): can be selected by clicking it or moving the selection into it with the keyboard.
- Card lines: [groups](https://wordgard.net/docs/ref/#doc.Node.Spec.group), content (its spec's query), holds (as the schema resolves it), marks allowed, [param](https://wordgard.net/docs/ref/#doc.Node.Spec.validate). Press a tag to filter; double-click a card for its JSON.
