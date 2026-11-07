# @stesura/wordgard-dev-tools-panel

The [Wordgard DevTools](https://github.com/stesura/wordgard-dev-tools) panel, docked in your page.
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
[project README](https://github.com/stesura/wordgard-dev-tools#2-mount-the-panel).

## For coding agents

An [Agent Skill](https://agentskills.io) ships in the package, at
`node_modules/@stesura/wordgard-dev-tools-panel/skills/wordgard-devtools/SKILL.md`: how to set up
both packages, keep them out of production, and debug with the panel. Copy it to your agent's
skills folder (for Claude Code, `.claude/skills/`) or point your agent at it.

## License

MIT. Licenses of the bundled code are in `dist/THIRD_PARTY_LICENSES.txt`.
