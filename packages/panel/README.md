# @stesura/wordgard-dev-tools-panel

The [Wordgard DevTools](https://github.com/stesura/wordgard-devtools) panel, docked in your page.
Use it where the browser extension isn't available, or on a deployed demo.

```sh
npm install -D @stesura/wordgard-dev-tools @stesura/wordgard-dev-tools-panel
```

[`@stesura/wordgard-dev-tools`](https://www.npmjs.com/package/@stesura/wordgard-dev-tools) is a
peer dependency at the same version: both are released together. Register your editors with its
`wordgardDevtools()`, then:

```ts
import { mountDevtools } from "@stesura/wordgard-dev-tools-panel";

mountDevtools();
```

The panel docks at the bottom of the page and renders in a shadow root, so its styles and your
page's styles don't affect each other. Its React UI is bundled with it and loaded lazily on the
first `mountDevtools()` call. Your page doesn't need React. In production builds,
`mountDevtools()` mounts nothing and downloads nothing.

Options and details are in the
[project README](https://github.com/stesura/wordgard-devtools#2-mount-the-panel).

## License

MIT. Licenses of the bundled code are in `dist/THIRD_PARTY_LICENSES.txt`.
