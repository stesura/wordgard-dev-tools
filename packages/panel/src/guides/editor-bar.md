# Editor bar

The selected [editor](https://wordgard.net/docs/ref/#editor.Wordgard)'s view, under every tab: where it lives, and whether it draws, takes input, has focus or is composing.

- **[root](https://wordgard.net/docs/ref/#editor.Wordgard.root)**: where the editor lives, in the page's document or inside a shadow root.
- **[connected](https://wordgard.net/docs/ref/#editor.Wordgard.connected)**: attached to the page and drawing; when not, document changes aren't drawn.
- **[editable](https://wordgard.net/docs/ref/#editor.Wordgard.editable)**: the user can type in it; no means it's read-only.
- **[focusable](https://wordgard.net/docs/ref/#editor.Wordgard.focusable)**: it can take keyboard focus: it's editable, or read-only with a tabindex.
- **[focused](https://wordgard.net/docs/ref/#editor.Wordgard.hasFocus)**: it has keyboard focus now. Clicking in the in-page panel takes focus from it.
- **[IME](https://wordgard.net/docs/ref/#editor.Wordgard.composing)**: typing through an input method, as for Chinese or Japanese, or on some Android keyboards; "text changed" once the composition has changed the text.

## Tips

- The console button logs the editor; in the page's console, `$wg` is the same editor.
