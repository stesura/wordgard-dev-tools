# @stesura/wordgard-dev-tools

The page side of [Wordgard DevTools](https://github.com/stesura/wordgard-dev-tools): the
`wordgardDevtools()` plugin that registers your editors and the agent that answers the panel.
It doesn't use any framework.

```sh
npm install -D @stesura/wordgard-dev-tools @stesura/wordgard-dev-tools-panel
```

```ts
import { Wordgard } from "wordgard/editor";
import { basicSchema } from "wordgard/schema";
import { wordgardDevtools } from "@stesura/wordgard-dev-tools";

Wordgard.create({ parent, doc, config: [basicSchema(), wordgardDevtools({ name: "main" })] });
```

Then inspect your editors with the DevTools extension, or dock the panel in the page with
[`@stesura/wordgard-dev-tools-panel`](https://www.npmjs.com/package/@stesura/wordgard-dev-tools-panel).
The plugin adds nothing to production builds.

`wordgard` (`~0.7.0`: 0.7.x) is a peer dependency. Each Wordgard minor release needs a devtools
release; until then, npm refuses the install.

Options and details are in the
[project README](https://github.com/stesura/wordgard-dev-tools#usage).

## License

MIT
