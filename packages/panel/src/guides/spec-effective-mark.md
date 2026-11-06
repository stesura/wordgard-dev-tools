# Spec and effective

Spec is the mark type as defined ([`Mark.define`](https://wordgard.net/docs/ref/#doc.Mark.define)). Effective is what applies in this schema: defaults filled in, and the node types it may go on.

- `// default`: the spec doesn't set it. `inclusive` defaults to true; `spanning` to true for a mark drawn as an element, false for one set as attributes.
- `targets`, from the schema: the node types it may go on ([`markAllowed`](https://wordgard.net/docs/ref/#doc.Schema.markAllowed)), after any [`Schema.Override`](https://wordgard.net/docs/ref/#doc.Schema.Override) `markTarget`.
- Its rank isn't shown resolved: Wordgard keeps it internal (the spec's, if set, is in Spec).
