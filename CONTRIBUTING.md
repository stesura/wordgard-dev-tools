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
npm test                                     # Vitest in Chromium
npm run build                                # packages, extension (Chrome and Firefox), demo
npm run e2e -w wordgard-devtools-extension   # the built extension's panel against the demo
```

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

## Security

Don't open public issues for vulnerabilities: see [SECURITY.md](SECURITY.md).

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
