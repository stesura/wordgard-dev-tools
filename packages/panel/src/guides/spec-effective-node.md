# Spec and effective

Spec is the node type as defined ([`Plot.define`](https://wordgard.net/docs/ref/#doc.Plot.define), [`Leaf.define`](https://wordgard.net/docs/ref/#doc.Leaf.define)). Effective is what applies in this schema: defaults filled in, overrides applied, and what the schema works out.

- `// default`: the spec doesn't set it, so Wordgard's default applies (`neutral` is `!defining`; a plot with inline content can always be empty).
- `// override`: a [`Schema.Override`](https://wordgard.net/docs/ref/#doc.Schema.Override) (`nodeGroup`, `plotContent`) changed it. The Effective button turns amber, and a note says what.
- `// from the schema`: worked out from every type: what it may hold ([`canContain`](https://wordgard.net/docs/ref/#doc.Schema.canContain)) and the marks allowed on it ([`markAllowed`](https://wordgard.net/docs/ref/#doc.Schema.markAllowed)).
- Groups Wordgard assigns itself (All, Inline, Block, Leaf, Plot, Textblock) aren't listed.
