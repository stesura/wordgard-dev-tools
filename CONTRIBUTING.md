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
npm run typecheck
npm run lint                                 # the Rules of React (eslint-plugin-react-hooks)
npm test                                     # Vitest in Chromium
npm run build                                # packages, extension (Chrome and Firefox), demo
npm run compiler:check                       # each build went through the React Compiler
npm run e2e -w wordgard-devtools-extension   # the built extension's panel against the demo
```

The panel is compiled by the React Compiler in every build (`scripts/react-compiler.ts`), so
don't add `useMemo`, `useCallback` or `memo` for speed. Keep them only where a value must stay
the same object (ref callbacks that subscribe), and in the components that use TanStack Virtual,
which opt out with `"use no memo"`. A component the compiler can't compile fails the build: a
broken Rule of React (`npm run lint` says which), a construct the compiler doesn't support yet,
or an `eslint-disable` of a `react-hooks` rule inside it. Rewrite it, or opt it out.

Add or update tests for what you change.

## Code style

- Arrow functions, not `function`.
- No typecasts (`as`, `!`, `<T>x`). If one is unavoidable, explain why in the pull request.
- No inline imports, except `import()` for lazy loading.
- Comments only for decisions, workarounds or what the code can't say. Keep them short.
- React: avoid `useEffect`. Prefer external stores (`useSyncExternalStore`), event handlers and ref
  callbacks.
- The page side (`packages/devtools`) stays framework-free.

## Pull requests

- Keep each pull request to one change, and say what it changes and why.
- For a new feature or a change to the panel–page protocol, open an issue first.
- New runtime dependencies end up in the panel bundle and the extension: say why one is needed.
  Their licences are collected into `THIRD_PARTY_LICENSES.txt` at build time.

## Releasing

`@stesura/wordgard-dev-tools` and `@stesura/wordgard-dev-tools-panel` are always released
together, at one version.

1. `npm run release:version -- 0.2.0` sets that version in both packages, in every workspace
   that refers to them, in the agent's `VERSION`, and in the lockfile.
2. Commit, then tag and push: `git tag v0.2.0 && git push origin v0.2.0`.
3. The Release workflow runs CI, checks that the versions match the tag, then publishes both
   packages with provenance. Each one is built by its `prepack` script. A prerelease tag
   (`v0.2.0-beta.1`) publishes to the `next` dist-tag.

CI fails if the versions drift (`npm run release:check`).

The page side accepts `wordgard` from a floor up to 1. CI tests that floor; a daily workflow tests
the newest 0.x. When the page side starts using a newer Wordgard API, raise the floor in
`packages/devtools/package.json` and the `wordgard` default in `.github/actions/setup/action.yml`
together. `release:check` fails if they differ.

## Security

Don't open public issues for vulnerabilities: see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
