# Node groups

[Groups](https://wordgard.net/docs/ref/#doc.Node.Group) are used to specify parent-child relationships between nodes, and valid targets for marks. Wordgard's own are the predefined groups, provided as static properties on `Node.Group` (such as [`Node.Group.Content`](https://wordgard.net/docs/ref/#doc.Node.Group.Content)), and shown by those names. Groups a schema defines itself, with [`Node.Group.define`](https://wordgard.net/docs/ref/#doc.Node.Group.define), have no name: they're numbered.

- types: the node types in it. content of, target of: where the schema names it.
- `automatic`: Wordgard puts types in these by what they are: [All](https://wordgard.net/docs/ref/#doc.Node.Group.All), [Inline](https://wordgard.net/docs/ref/#doc.Node.Group.Inline), [Block](https://wordgard.net/docs/ref/#doc.Node.Group.Block), [Leaf](https://wordgard.net/docs/ref/#doc.Node.Group.Leaf), [Plot](https://wordgard.net/docs/ref/#doc.Node.Group.Plot), [Textblock](https://wordgard.net/docs/ref/#doc.Node.Group.Textblock).
- Groups may have a [parent group](https://wordgard.net/docs/ref/#doc.Node.Group.parent): membership of a group implies membership of its parent groups.
- A group only a [schema override](https://wordgard.net/docs/ref/#doc.Schema.Override) names isn't seen here.
