# Key bindings

The editor's [key bindings](https://wordgard.net/docs/ref/#editor.KeyBinding): those the configuration registers through [`KeyBinding.source`](https://wordgard.net/docs/ref/#editor.KeyBinding.source), by precedence, then Wordgard's [default keymap](https://wordgard.net/docs/ref/#editor.KeyBinding.defaultKeymap), unless [`useDefaultKeymap`](https://wordgard.net/docs/ref/#editor.KeyBinding.useDefaultKeymap) is off.

- `#`: the order Wordgard tries them in. For a key, the first whose command returns true wins; the ones after it don't run.
- `key`: as on this platform, `Mod-` spelled out. A quoted character matches what the key types; `any key` is an `any` handler, called for every key.
- `command`: the command's name, its parameter in brackets for a bound command. `with Shift`: the command for `Shift-` plus the key.
- `notes`: `default keymap`, from Wordgard's defaults rather than the configuration; `allows default`, Wordgard doesn't call `preventDefault`, so the browser acts on the key too.

## Tips

- Sort by `#`, key or command: a heading sorts ascending, then descending. Sorted by key, the bindings sharing a key sit together, the one tried first has the lowest `#`.
- Click a row, or move to it with ↑ ↓ Home End, then press Enter (or Shift+F10, or right-click it) for its menu: log its command to the console to jump to its definition, or copy its key, command or JSON.
- Search by key, command, description or group; Escape clears the search, then closes the pane.
