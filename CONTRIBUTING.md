# Contributing

Thanks for helping. Bug reports, ideas and pull requests are welcome.

## Setup

This repository expects `wordgard` and
[`react-wordgard`](https://github.com/stesura/react-wordgard) checked out next to it: they are local
path dependencies (`../wordgard`, `../react-wordgard`).

```sh
(cd ../wordgard && npm install --no-package-lock)   # builds its dist/
npm install
npx playwright install chromium                      # once, for the tests
npm run dev                                          # the demo, with the panel docked
```

Node 22.12 or later. Use npm.

## Checks

Run these before opening a pull request. CI runs the same ones.

```sh
npm run format:check                         # Prettier (npm run format fixes it)
npm run typecheck
npm run lint                                 # the Rules of React, arrow functions
npm run dependency-check                     # dependency-cruiser: the layers below
npm test                                     # Vitest in Chromium
npm run build                                # packages, extension (Chrome and Firefox), demo
npm run compiler:check                       # each build went through the React Compiler
npm run e2e -w wordgard-devtools-extension   # the built extension's panel against the demo
```

The panel is compiled by the React Compiler in every build (`scripts/react-compiler.ts`), so
don't add `useMemo`, `useCallback` or `memo` for speed. Keep them only where a value must stay
the same object (ref callbacks that subscribe, and what they call). Long lists draw their rows
through `useRows` (`packages/panel/src/hooks/use-rows.ts`), not a library the compiler can't follow.

A component the compiler can't compile fails the build: a broken Rule of React (`npm run lint`
says which), a construct the compiler doesn't support yet, or an `eslint-disable` of a
`react-hooks` rule inside it. Rewrite it; opt it out with `"use no memo"` only as a last resort.

Add or update tests for what you change. In every package:

- unit tests, which call a module directly, sit beside it in a `__tests__` folder and are named
  `<module>.spec.ts` (`src/lib/__tests__/paths.spec.ts` tests `src/lib/paths.ts`);
- larger tests are named `<what>.test.ts`: integration tests, which put editors on a page (and,
  in the panel, mount it), in the package's `test/`; the extension's end-to-end tests, which
  drive the built extension, in `packages/extension/e2e/`.

## Code style

- Arrow functions, not `function`.
- No typecasts (`as`, `!`, `<T>x`). If one is unavoidable, explain why in the pull request.
- No inline imports, except `import()` for lazy loading.
- Comments only for decisions, workarounds or what the code can't say. Keep them short.
- Formatting is Prettier's (`npm run format`), Tailwind classes sorted by its plugin.
- File names in kebab-case.
- React: avoid `useEffect`. Prefer external stores (nanostores atoms, read with `useStore`), event
  handlers and ref callbacks.
- The page side (`packages/devtools`) stays framework-free.

## The panel's layout

`packages/panel/src`, layered; `npm run dependency-check` enforces the rules (type-only imports
are exempt, and so are tests in `__tests__`, which may import from any layer):

- `tabs/<tab>/`: one folder per tab, its component beside its helpers and its source (what it
  loads from the page). A tab doesn't import another tab: what they share goes below.
  `tabs/tabs.ts` lists the tabs (plain data, open to every layer); `tabs/registry.tsx` maps them
  to their components.
- `panel/`: the shell around the tabs (header, tab bar, settings) and the in-page dock.
- `components/`: components shared by the tabs. `components/ui/` is shadcn's, kept apart.
- `hooks/`: hooks shared by the tabs.
- `stores/`: the panel store, the theme, saved settings (`persistent`), `createResource`,
  `whileShown`. No components, tabs, panel or hooks.
- `lib/`: plain helpers, no React.
- `guides/`: each guide in markdown, `# Title`, one paragraph, then an optional list of notes
  (Wordgard's concepts, what the view shows) and an optional `## Tips` list (using the panel:
  clicks, right-clicks, toolbars, other panes); inline only `` `code` ``, `**bold**` and `[links](url)`. The
  panel shows them, and `npm run readme` writes the tabs' guides into the README.

Imports across these folders use the package's aliases (`#components/…`, `#lib/…`,
`#stores/…`, `#hooks/…`); within a folder they stay relative.

shadcn components: `npx shadcn add <name>` in `packages/panel`, then import its icons from
`#icons` (heroicons; add the one it needs to `src/icons/heroicons.tsx`), remove `lucide-react` if
it was added, turn its `function`s into arrow functions, add its `@base-ui/react/<name>` to
`optimizeDeps.include` in `packages/panel/vite.config.ts`, and run `npm run format`.

## Pull requests

- Keep each pull request to one change, and say what it changes and why.
- For a new feature or a change to the panel–page protocol, open an issue first.
- New runtime dependencies end up in the panel bundle and the extension: say why one is needed.
  Their licences are collected into `THIRD_PARTY_LICENSES.txt` at build time.

## Releasing

Add a line about your change to `CHANGELOG.md` under `## Unreleased`. How releases are made is in
[RELEASE.md](RELEASE.md).

## Security

Don't open public issues for vulnerabilities: see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
