# Releasing

`@stesura/wordgard-dev-tools` and `@stesura/wordgard-dev-tools-panel` are always released
together, at one version. The browser extension isn't released yet.

## Versions

Wordgard DevTools stays on 0.x until Wordgard reaches 1.0. Until then a minor version (0.2.0) may
break things; a patch (0.1.1) doesn't.

## Changelog

Each change adds a line to `CHANGELOG.md` under `## Unreleased`, in Wordgard's format: one
sentence per paragraph, under `### Breaking changes`, `### Bug fixes` or `### New features`. The
release names that section and uses it for the GitHub release.

## Before the first release

- `npm login`, with an account that can publish under `@stesura`.
- `gh auth login`.

## Steps

On `main`, up to date with `origin/main`, nothing uncommitted:

1. `npm run release:prepare -- 0.2.0`
   - names `## Unreleased` in `CHANGELOG.md` after the version and today's date;
   - sets the version in both packages, in every workspace that refers to them, in the agent's
     `VERSION` (`packages/devtools/src/version.ts`) and in the lockfile (`npm run release:version`);
   - runs `npm run check`, `npm test`, `npm run build` and `npm run compiler:check`.
2. Review the changes, commit and push.
3. `npm run release:publish`
   - waits for CI on the pushed commit (the end-to-end tests run there);
   - asks, then publishes the page side, then the panel (each built by its `prepack`);
   - tags `v0.2.0` and pushes the tag;
   - creates the GitHub release from the CHANGELOG section;
   - deploys the demo to [GitHub Pages](https://stesura.github.io/wordgard-dev-tools/).

A prerelease (`0.2.0-beta.1`) publishes to the `next` dist-tag and is marked as a prerelease on
GitHub.

The script is `scripts/release.ts`.

## When something fails

- **A check fails in `release:prepare`**: restore the release changes (`git restore .`), commit
  the fix, and run it again.
- **CI fails in `release:publish`**: nothing was published. Fix it, or rerun the CI run if it was
  flaky (`gh run rerun <id>`), then run `release:publish` again.
- **`release:publish` stops halfway** (a publish, the tag, the GitHub release): run it again. It
  skips what's done: packages already on npm, a tag already pushed, a release already created.

A version can't be published twice, and unpublishing blocks the package name for 24 hours: fix
forward with a patch release.

## The demo

The Demo workflow (`.github/workflows/demo.yml`) builds `demo/` with the base `/wordgard-dev-tools/`
and deploys it to GitHub Pages. `release:publish` starts it. To deploy without a release:
`gh workflow run demo.yml --ref main`.

## Wordgard versions

The page side accepts `wordgard` from a floor up to 1. CI tests that floor; a daily workflow tests
the newest 0.x. When the page side starts using a newer Wordgard API, raise the floor in
`packages/devtools/package.json` and the `wordgard` default in `.github/actions/setup/action.yml`
together. `npm run release:check` fails if they differ, or if the versions drift.
