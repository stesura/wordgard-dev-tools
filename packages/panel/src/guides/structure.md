# Structure

The document as represented by a tree of nested boxes, each box being a [plots](https://wordgard.net/docs/ref/#doc.Plot) or a [leaf](https://wordgard.net/docs/ref/#doc.Leaf) node.

- Each node displays its [type](https://wordgard.net/docs/ref/#doc.Node.Type), [marks](https://wordgard.net/docs/ref/#doc.Mark) and from–to positions.
- Selection is show through a darker (lighter in dark mode) background.
- [A document is a tree of nodes](https://wordgard.net/docs/ref/#h-document): [plots](https://wordgard.net/docs/ref/#doc.Plot) (nodes with content nodes) or [leaves](https://wordgard.net/docs/ref/#doc.Leaf); [marks](https://wordgard.net/docs/ref/#doc.Mark) are pieces of information attached to nodes.

## Tips

- Click a box for its detail and JSON; Escape clears it.
- Right-click a box for more actions.
- Use the pick button, then click in the page, to find a node.
- Decorations shows the editor's [decorations](https://wordgard.net/docs/ref/#editor.Decoration): ◆ marks a widget, ◇ 2 a node with two decorations.
- By default a range decoration applies to the text in its range, not the paragraph around it; a point decoration to the node starting at it.
