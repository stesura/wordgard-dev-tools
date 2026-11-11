# DOM

The editor's [content DOM](https://wordgard.net/docs/ref/#editor.Wordgard.contentDOM): the editable DOM element holding the editor content. Each element shows the document node it draws; text shows its position.

- Elements that draw no node and hold none of the document's text, such as widgets, are marked as chrome. Marks and wrapper decorations hold the document's text: they aren't.
- Whether the editor is connected, editable, focused or composing: the bottom bar's Editor.

## Tips

- Click an element to outline it in the page; Escape clears it.
- Right-click an element to show its node in the Structure, log it, or log or copy its outer HTML.
