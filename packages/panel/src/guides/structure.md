# Structure

The document as nested boxes: each node with its type, marks and from–to positions. The selection is marked: in a cell selection, every selected cell, with the anchor and head cells. [A document is a tree of nodes](https://wordgard.net/docs/ref/#h-document): [plots](https://wordgard.net/docs/ref/#doc.Plot) (nodes with content nodes) or [leaves](https://wordgard.net/docs/ref/#doc.Leaf); [marks](https://wordgard.net/docs/ref/#doc.Mark) are pieces of information attached to nodes.

- from–to: [positions are offset numbers](https://wordgard.net/docs/ref/#h-resolved-positions) into the document.
- Hover a box to outline its node in the page; click it for its detail, parameters and JSON.
- Right-click a box to scroll it into view, show its type in Schema or its element in DOM, log it, or copy its JSON or path.
- Press the pick button in the header, then click in the page, to find a node here.
